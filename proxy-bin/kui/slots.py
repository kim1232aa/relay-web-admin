#!/usr/bin/env python3
"""One Tor process per country. Only ready circuits are published."""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

BIN = Path(os.environ.get("PROXY_BIN") or Path(__file__).resolve().parents[1])
NAT = BIN / "native"
TOR_ROOT = BIN / "tor"
STATUS = BIN / "slots.json"
LOG = BIN / "slots.log"
PID_FILE = BIN / "slots.pid"

PLAN = [
    {"id": "jp", "country": "JP", "port": 9051, "exit": "{jp}", "strict": False},
    {"id": "us", "country": "US", "port": 9052, "exit": "{us}", "strict": False},
    {"id": "de", "country": "DE", "port": 9053, "exit": "{de}", "strict": True},
    {"id": "nl", "country": "NL", "port": 9054, "exit": "{nl}", "strict": True},
    {"id": "kr", "country": "KR", "port": 9055, "exit": "{kr}", "strict": False},
    {"id": "sg", "country": "SG", "port": 9056, "exit": "{sg}", "strict": False},
    {"id": "au", "country": "AU", "port": 9057, "exit": "{au}", "strict": False},
    {"id": "ca", "country": "CA", "port": 9058, "exit": "{ca}", "strict": True},
    {"id": "fr", "country": "FR", "port": 9059, "exit": "{fr}", "strict": True},
    {"id": "gb", "country": "GB", "port": 9060, "exit": "{gb}", "strict": True},
    {"id": "se", "country": "SE", "port": 9061, "exit": "{se}", "strict": True},
    {"id": "ch", "country": "CH", "port": 9062, "exit": "{ch}", "strict": False},
]

ENV = {**os.environ, "LD_LIBRARY_PATH": str(NAT / "lib")}


def stamp(msg: str) -> None:
    LOG.open("a").write(time.strftime("%Y-%m-%dT%H:%M:%SZ ", time.gmtime()) + msg + "\n")


def tor_bin() -> str:
    return str(NAT / "tor")


def write_status(slots: list[dict]) -> None:
    STATUS.write_text(json.dumps({"updated": int(time.time()), "slots": slots}, ensure_ascii=False, indent=2) + "\n")


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


def write_torrc(slot: dict) -> Path:
    data = TOR_ROOT / slot["id"]
    data.mkdir(parents=True, exist_ok=True)
    (data / "data").mkdir(exist_ok=True)
    rc = data / "torrc"
    rc.write_text(
        "\n".join(
            [
                f"SocksPort 127.0.0.1:{slot['port']}",
                f"DataDirectory {data / 'data'}",
                f"GeoIPFile {NAT / 'geoip'}",
                f"GeoIPv6File {NAT / 'geoip6'}",
                f"Log notice file {data / 'notice.log'}",
                f"PidFile {data / 'tor.pid'}",
                "AvoidDiskWrites 1",
                "ClientOnly 1",
                f"ExitNodes {slot['exit']}",
                f"StrictNodes {1 if slot['strict'] else 0}",
                "",
            ]
        )
    )
    return rc


def start_tor(slot: dict) -> None:
    data = TOR_ROOT / slot["id"]
    pid = read_pid(data / "tor.pid")
    if pid_alive(pid):
        return
    rc = write_torrc(slot)
    log = (data / "notice.log").open("ab")
    proc = subprocess.Popen(
        [tor_bin(), "-f", str(rc)],
        env=ENV,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    for _ in range(30):
        time.sleep(0.1)
        if read_pid(data / "tor.pid"):
            break
    stamp(f"tor {slot['id']} pid={read_pid(data / 'tor.pid') or proc.pid} socks=127.0.0.1:{slot['port']}")


def bootstrapped(slot: dict) -> bool:
    log = TOR_ROOT / slot["id"] / "notice.log"
    try:
        return "Bootstrapped 100" in log.read_text(errors="replace")
    except OSError:
        return False


def probe_socks(port: int) -> str:
    try:
        out = subprocess.run(
            [
                "curl",
                "-fsS",
                "--max-time",
                "12",
                "--socks5-hostname",
                f"127.0.0.1:{port}",
                "https://api.ipify.org",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        ip = (out.stdout or "").strip()
        return ip if out.returncode == 0 and ip else ""
    except Exception:
        return ""


def snapshot() -> list[dict]:
    rows = []
    for slot in PLAN:
        pid = read_pid(TOR_ROOT / slot["id"] / "tor.pid")
        ready = pid_alive(pid) and bootstrapped(slot)
        ip = probe_socks(slot["port"]) if ready else ""
        rows.append(
            {
                "id": slot["id"],
                "country": slot["country"],
                "socks": slot["port"],
                "state": "ready" if ip else ("boot" if pid_alive(pid) else "down"),
                "egress_ip": ip,
                "pid": pid if pid_alive(pid) else 0,
            }
        )
        stamp(f"slot {slot['id']} state={rows[-1]['state']} ip={ip or '-'}")
    return rows


def loop() -> None:
    PID_FILE.write_text(str(os.getpid()) + "\n")
    stamp("slots start")
    for slot in PLAN:
        start_tor(slot)
    while True:
        for slot in PLAN:
            start_tor(slot)
        write_status(snapshot())
        time.sleep(45)


if __name__ == "__main__":
    TOR_ROOT.mkdir(parents=True, exist_ok=True)
    loop()
