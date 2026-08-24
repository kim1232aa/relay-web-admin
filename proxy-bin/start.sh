#!/bin/bash
set -e
BIN="$(cd "$(dirname "$0")" && pwd)"
cd "$BIN"
bash "$BIN/install.sh"
mkdir -p "$BIN/socks" "$BIN/tor" "$BIN/ovpn"

python3 - "$BIN" <<'PY'
import json, sys
from pathlib import Path
bin = Path(sys.argv[1])
p = bin / "xray.json"
cfg = json.loads(p.read_text())
for ib in cfg.get("inbounds", []):
    listen = ib.get("listen")
    if isinstance(listen, str) and listen.endswith(".sock"):
        ib["listen"] = str(bin / "socks" / Path(listen).name)
p.write_text(json.dumps(cfg, indent=2) + "\n")
PY

stop_pid() {
  local f="$1"
  if [ -f "$f" ]; then
    kill "$(cat "$f")" 2>/dev/null || true
    rm -f "$f"
  fi
}

stop_pid "$BIN/xray.pid"
stop_pid "$BIN/mux.pid"
stop_pid "$BIN/cloudflared.pid"
python3 -c '
import os, sys
needle = "node " + sys.argv[1] + "/mux.mjs"
for pid in os.listdir("/proc"):
    if not pid.isdigit():
        continue
    try:
        cmd = open("/proc/%s/cmdline" % pid, "rb").read().replace(b"\0", b" ").decode().strip()
    except OSError:
        continue
    if cmd == needle:
        try:
            os.kill(int(pid), 15)
        except OSError:
            pass
' "$BIN"
rm -f "$BIN/socks/"in-*.sock "$BIN/socks/"*.sock.lock
sleep 0.3

"$BIN/xray" run -c "$BIN/xray.json" >>"$BIN/xray.log" 2>&1 &
echo $! >"$BIN/xray.pid"

node "$BIN/mux.mjs" >>"$BIN/mux.log" 2>&1 &
echo $! >"$BIN/mux.pid"

: >"$BIN/cf.log"
if [ -s "$BIN/cf-tunnel-token" ]; then
  "$BIN/cloudflared" tunnel --protocol http2 --no-autoupdate run --token "$(tr -d '\n' <"$BIN/cf-tunnel-token")" >>"$BIN/cf.log" 2>&1 &
else
  "$BIN/cloudflared" tunnel --protocol http2 --no-autoupdate --url http://127.0.0.1:38079 >>"$BIN/cf.log" 2>&1 &
fi
echo $! >"$BIN/cloudflared.pid"

if [ -f "$BIN/slots.pid" ] && kill -0 "$(cat "$BIN/slots.pid")" 2>/dev/null; then
  :
else
  PROXY_BIN="$BIN" PYTHONPATH="$BIN" python3 "$BIN/kui/slots.py" >>"$BIN/slots.log" 2>&1 &
  echo $! >"$BIN/slots.pid"
fi

if [ -f "$BIN/ovpn-slots.pid" ] && kill -0 "$(cat "$BIN/ovpn-slots.pid")" 2>/dev/null; then
  :
else
  PROXY_BIN="$BIN" PYTHONPATH="$BIN" python3 "$BIN/kui/ovpn_slots.py" >>"$BIN/ovpn-slots.log" 2>&1 &
  echo $! >"$BIN/ovpn-slots.pid"
fi

for i in $(seq 1 30); do
  host=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$BIN/cf.log" | tail -1 | sed 's|https://||')
  if [ -n "$host" ]; then
    echo "$host" >"$BIN/cf-hostname"
    echo "tunnel $host"
    exit 0
  fi
  sleep 1
done

echo "cloudflared started, hostname pending" >&2
exit 0
