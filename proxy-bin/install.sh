#!/bin/bash
# Fetch xray / cloudflared / geoip and (if missing) Tor+OpenVPN into proxy-bin/.
set -euo pipefail
BIN="$(cd "$(dirname "$0")" && pwd)"
NAT="$BIN/native"
TMP="$BIN/.install-tmp"
mkdir -p "$BIN/socks" "$BIN/tor" "$BIN/ovpn" "$NAT/lib" "$TMP"

need() { [ -x "$1" ]; }

fetch() {
  local url="$1" out="$2"
  curl -fL --retry 3 --retry-delay 2 -o "$out" "$url"
}

if ! need "$BIN/xray"; then
  echo "install xray"
  fetch "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip" "$TMP/xray.zip"
  python3 - "$TMP/xray.zip" "$BIN" <<'PY'
import sys, zipfile, os, stat
z=zipfile.ZipFile(sys.argv[1])
dest=sys.argv[2]
for name in z.namelist():
    base=os.path.basename(name)
    if base in ("xray", "geoip.dat", "geosite.dat"):
        z.extract(name, "/tmp")
        src=os.path.join("/tmp", name)
        os.replace(src, os.path.join(dest, base))
os.chmod(os.path.join(dest, "xray"), 0o755)
PY
fi

if [ ! -f "$BIN/geoip.dat" ] || [ ! -f "$BIN/geosite.dat" ]; then
  echo "install geoip/geosite"
  fetch "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip" "$TMP/xray.zip"
  python3 - "$TMP/xray.zip" "$BIN" <<'PY'
import sys, zipfile, os
z=zipfile.ZipFile(sys.argv[1]); dest=sys.argv[2]
for name in z.namelist():
    base=os.path.basename(name)
    if base in ("geoip.dat", "geosite.dat") and not os.path.exists(os.path.join(dest, base)):
        z.extract(name, "/tmp")
        os.replace(os.path.join("/tmp", name), os.path.join(dest, base))
PY
fi

if ! need "$BIN/cloudflared"; then
  echo "install cloudflared"
  fetch "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" "$BIN/cloudflared"
  chmod +x "$BIN/cloudflared"
fi

# Prefer distro binaries; otherwise unpack Debian bookworm debs into native/.
have_sys=0
if command -v tor >/dev/null && command -v openvpn >/dev/null && command -v slirp4netns >/dev/null && command -v ip >/dev/null; then
  have_sys=1
  ln -sfn "$(command -v tor)" "$NAT/tor"
  ln -sfn "$(command -v openvpn)" "$NAT/openvpn"
  ln -sfn "$(command -v slirp4netns)" "$NAT/slirp4netns"
  ln -sfn "$(command -v ip)" "$NAT/ip"
  if [ -f /usr/share/tor/geoip ]; then ln -sfn /usr/share/tor/geoip "$NAT/geoip"; fi
  if [ -f /usr/share/tor/geoip6 ]; then ln -sfn /usr/share/tor/geoip6 "$NAT/geoip6"; fi
fi

if [ "$have_sys" -eq 0 ] && ! need "$NAT/tor"; then
  echo "install tor/openvpn/slirp from Debian debs"
  python3 - "$NAT" "$TMP" <<'PY'
import gzip, os, shutil, subprocess, sys, urllib.request
from pathlib import Path
nat, tmp = map(Path, sys.argv[1:])
mirror = "http://deb.debian.org/debian"
pkgs_needed = {
    "tor", "tor-geoipdb", "openvpn", "slirp4netns", "libslirp0",
    "iproute2", "liblzo2-2", "libpkcs11-helper1", "libnl-3-200",
    "libnl-genl-3-200", "libbpf1", "libmnl0", "libevent-2.1-7",
}
raw = gzip.decompress(urllib.request.urlopen(mirror + "/dists/bookworm/main/binary-amd64/Packages.gz", timeout=60).read()).decode()
index, cur = {}, {}
for line in raw.splitlines():
    if not line:
        if cur.get("Package") in pkgs_needed:
            index[cur["Package"]] = cur
        cur = {}
        continue
    if ": " in line and not line.startswith(" "):
        k, v = line.split(": ", 1)
        cur[k] = v
extract = tmp / "debroot"
extract.mkdir(exist_ok=True)
for name, meta in index.items():
    deb = tmp / (name + ".deb")
    urllib.request.urlretrieve(mirror + "/" + meta["Filename"], deb)
    subprocess.check_call(["dpkg-deb", "-x", str(deb), str(extract)])

def take(src: Path, dest: Path, mode=None):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_symlink() or src.is_file():
        shutil.copy2(src, dest, follow_symlinks=True)
        if mode:
            os.chmod(dest, mode)

for rel, dest in {
    "usr/bin/tor": "tor",
    "usr/sbin/tor": "tor",
    "usr/sbin/openvpn": "openvpn",
    "usr/bin/slirp4netns": "slirp4netns",
    "usr/bin/ip": "ip",
    "sbin/ip": "ip",
    "usr/share/tor/geoip": "geoip",
    "usr/share/tor/geoip6": "geoip6",
}.items():
    src = extract / rel
    if src.exists():
        take(src, nat / dest, 0o755 if dest not in ("geoip", "geoip6") else None)

libdir = nat / "lib"
libdir.mkdir(exist_ok=True)
for folder in ("usr/lib/x86_64-linux-gnu", "lib/x86_64-linux-gnu"):
    p = extract / folder
    if not p.is_dir():
        continue
    for f in p.iterdir():
        if f.is_file() or f.is_symlink():
            take(f, libdir / f.name)
print("native", sorted(x.name for x in nat.iterdir()))
PY
  chmod +x "$NAT/tor" "$NAT/openvpn" "$NAT/slirp4netns" "$NAT/ip" 2>/dev/null || true
fi

rm -rf "$TMP"
echo "install ok"
