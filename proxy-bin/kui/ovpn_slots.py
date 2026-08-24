#!/usr/bin/env python3
"""OpenVPN in a netns (host TUN is blocked). TCP/443 VPNGate + slirp4netns."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from pathlib import Path

BIN = Path(os.environ.get("PROXY_BIN") or Path(__file__).resolve().parents[1])
NAT = BIN / "native"
ROOT = BIN / "ovpn"
STATUS = BIN / "ovpn.json"
LOG = BIN / "ovpn-slots.log"
PID_FILE = BIN / "ovpn-slots.pid"
ENV = {**os.environ, "LD_LIBRARY_PATH": str(NAT / "lib"), "PYTHONPATH": str(BIN)}

PLAN = [
    {"id": "ovpn-jp", "country": "JP", "port": 9171},
    {"id": "ovpn-kr", "country": "KR", "port": 9172},
    {"id": "ovpn-ro", "country": "RO", "port": 9173},
]


def stamp(msg: str) -> None:
    LOG.open("a").write(time.strftime("%Y-%m-%dT%H:%M:%SZ ", time.gmtime()) + msg + "\n")


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def read_pid(path: Path) -> int:
    try:
        return int(path.read_text().strip())
    except Exception:
        return 0


def spawn(cmd: list[str], log: Path, extra_env: dict | None = None) -> int:
    env = dict(ENV)
    if extra_env:
        env.update(extra_env)
    log.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(cmd, env=env, stdout=log.open("ab"), stderr=subprocess.STDOUT, start_new_session=True)
    return proc.pid


def nsenter(nspid: int, args: list[str], log: Path | None = None) -> subprocess.Popen:
    cmd = ["nsenter", "-t", str(nspid), "-n", "--"] + args
    if log is None:
        return subprocess.Popen(cmd, env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return subprocess.Popen(cmd, env=ENV, stdout=log.open("ab"), stderr=subprocess.STDOUT, start_new_session=True)


def probe(port: int) -> str:
    r = subprocess.run(
        ["curl", "-fsS", "--max-time", "12", "--socks5-hostname", f"127.0.0.1:{port}", "https://api.ipify.org"],
        capture_output=True,
        text=True,
    )
    ip = (r.stdout or "").strip()
    return ip if r.returncode == 0 and ip else ""


def make_netns(slot_dir: Path) -> int:
    pid = read_pid(slot_dir / "ns.pid")
    if pid_alive(pid):
        return pid
    import ctypes

    child = os.fork()
    if child == 0:
        libc = ctypes.CDLL("libc.so.6")
        if libc.unshare(0x40000000) != 0:
            os._exit(1)
        os.setsid()
        (slot_dir / "ns.pid").write_text(str(os.getpid()) + "\n")
        signal.pause()
        os._exit(0)
    for _ in range(30):
        time.sleep(0.1)
        pid = read_pid(slot_dir / "ns.pid")
        if pid_alive(pid):
            return pid
    return 0


def ensure_slirp(nspid: int, slot_dir: Path) -> None:
    pid = read_pid(slot_dir / "slirp.pid")
    if pid_alive(pid):
        return
    p = spawn(
        [str(NAT / "slirp4netns"), "--configure", "--mtu=65520", "--disable-host-loopback", str(nspid), "tap0"],
        slot_dir / "slirp.log",
    )
    (slot_dir / "slirp.pid").write_text(str(p) + "\n")
    time.sleep(0.8)


def pick_profile(country: str) -> str:
    from kui.vpngate import fetch_nodes

    nodes = fetch_nodes(timeout=20)
    cands = []
    for n in nodes:
        proto = port = ""
        for line in n["config"].splitlines():
            if line.startswith("proto "):
                proto = line.split()[1]
            if line.startswith("remote ") and len(line.split()) >= 3:
                port = line.split()[2]
        if n.get("country") == country and proto.startswith("tcp") and port == "443":
            cands.append(n)
    cands.sort(key=lambda n: int(n.get("ping") or 9999))
    if not cands:
        raise RuntimeError(f"no tcp/443 VPNGate for {country}")
    return cands[0]["config"]


def ensure_openvpn(nspid: int, slot: dict, slot_dir: Path) -> None:
    pid = read_pid(slot_dir / "openvpn.pid")
    if pid_alive(pid) and "Initialization Sequence Completed" in (slot_dir / "openvpn.log").read_text(errors="replace"):
        return
    cfg = slot_dir / "client.ovpn"
    if not cfg.exists():
        cfg.write_text(pick_profile(slot["country"]))
    auth = slot_dir / "auth.txt"
    auth.write_text("vpn\nvpn\n")
    auth.chmod(0o600)
    log = slot_dir / "openvpn.log"
    if log.exists():
        log.write_text("")
    proc = nsenter(
        nspid,
        [
            str(NAT / "openvpn"),
            "--config",
            str(cfg),
            "--dev",
            "tun0",
            "--dev-type",
            "tun",
            "--nobind",
            "--route-nopull",
            "--auth-user-pass",
            str(auth),
            "--data-ciphers",
            "AES-128-CBC:AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305",
            "--data-ciphers-fallback",
            "AES-128-CBC",
            "--connect-timeout",
            "15",
            "--connect-retry-max",
            "2",
            "--verb",
            "3",
            "--log",
            str(log),
            "--writepid",
            str(slot_dir / "openvpn.pid"),
        ],
        slot_dir / "openvpn-wrap.log",
    )
    (slot_dir / "openvpn-host.pid").write_text(str(proc.pid) + "\n")
    for _ in range(25):
        time.sleep(1)
        text = log.read_text(errors="replace") if log.exists() else ""
        if "Initialization Sequence Completed" in text:
            stamp(f"{slot['id']} openvpn ready")
            return
        if "AUTH_FAILED" in text or "Exiting due" in text:
            stamp(f"{slot['id']} openvpn fail")
            return
    stamp(f"{slot['id']} openvpn timeout")


def ensure_socks(nspid: int, slot: dict, slot_dir: Path) -> None:
    unix = BIN / "socks" / f"{slot['id']}.unix"
    ns_pid = read_pid(slot_dir / "ns-socks.pid")
    if not pid_alive(ns_pid):
        proc = nsenter(
            nspid,
            ["python3", str(BIN / "kui/ovpn_bridge.py"), "ns-socks", str(unix), "tun0"],
            slot_dir / "ns-socks.log",
        )
        (slot_dir / "ns-socks.pid").write_text(str(proc.pid) + "\n")
    fwd_pid = read_pid(slot_dir / "fwd.pid")
    if not pid_alive(fwd_pid):
        p = spawn(
            ["python3", str(BIN / "kui/ovpn_bridge.py"), "host-fwd", str(slot["port"]), str(unix)],
            slot_dir / "fwd.log",
        )
        (slot_dir / "fwd.pid").write_text(str(p) + "\n")
        time.sleep(0.3)


def adopt_legacy_jp() -> None:
    """Keep the already-working test netns as ovpn-jp."""
    slot_dir = ROOT / "ovpn-jp"
    slot_dir.mkdir(parents=True, exist_ok=True)
    legacy = Path("/tmp/ovpn-test/ns.pid")
    if not legacy.exists():
        return
    nspid = read_pid(legacy)
    if not pid_alive(nspid):
        return
    (slot_dir / "ns.pid").write_text(str(nspid) + "\n")
    for src, dst in [
        ("/workspace/proxy-bin/ovpn-ns-socks.pid", "ns-socks.pid"),
        ("/workspace/proxy-bin/ovpn-fwd.pid", "fwd.pid"),
        ("/tmp/ovpn-test/live.pid", "openvpn.pid"),
        ("/tmp/ovpn-test/slirp.pid", "slirp.pid"),
    ]:
        p = Path(src)
        if p.exists() and not (slot_dir / dst).exists():
            (slot_dir / dst).write_text(p.read_text())
    stamp("adopted legacy ovpn-jp netns")


def bring_up(slot: dict) -> dict:
    slot_dir = ROOT / slot["id"]
    slot_dir.mkdir(parents=True, exist_ok=True)
    if slot["id"] == "ovpn-jp":
        adopt_legacy_jp()
    ip = probe(slot["port"])
    if ip:
        return {**slot, "state": "ready", "egress_ip": ip, "kind": "openvpn"}
    nspid = make_netns(slot_dir)
    if not nspid:
        return {**slot, "state": "down", "egress_ip": "", "kind": "openvpn"}
    ensure_slirp(nspid, slot_dir)
    ensure_openvpn(nspid, slot, slot_dir)
    ensure_socks(nspid, slot, slot_dir)
    time.sleep(0.5)
    ip = probe(slot["port"])
    return {**slot, "state": "ready" if ip else "boot", "egress_ip": ip, "kind": "openvpn"}


def loop() -> None:
    PID_FILE.write_text(str(os.getpid()) + "\n")
    ROOT.mkdir(parents=True, exist_ok=True)
    (BIN / "socks").mkdir(exist_ok=True)
    stamp("ovpn slots start")
    while True:
        rows = []
        for slot in PLAN:
            try:
                rows.append(bring_up(slot))
            except Exception as e:
                stamp(f"{slot['id']} error {e}")
                rows.append({**slot, "state": "down", "egress_ip": "", "kind": "openvpn"})
        STATUS.write_text(json.dumps({"updated": int(time.time()), "slots": rows}, ensure_ascii=False, indent=2) + "\n")
        time.sleep(40)


if __name__ == "__main__":
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    loop()
