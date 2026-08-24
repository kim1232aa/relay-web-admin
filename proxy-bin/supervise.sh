#!/bin/bash
BIN=/workspace/proxy-bin
HOST_FILE="$BIN/cf-hostname"
LOG="$BIN/supervise.log"
INTERVAL=20

alive() {
  local f="$1"
  [ -f "$f" ] || return 1
  kill -0 "$(cat "$f")" 2>/dev/null
}

probe() {
  local host=""
  [ -s "$HOST_FILE" ] && host=$(tr -d ' \n' <"$HOST_FILE")
  if [ -z "$host" ]; then
    curl -sf --max-time 4 -o /dev/null "http://127.0.0.1:38079/vless"
    return $?
  fi
  curl -sf --max-time 8 -o /dev/null "https://${host}/vless"
}

stamp() {
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >>"$LOG"
}

stamp "supervise start"
while true; do
  if ! alive "$BIN/slots.pid"; then
    stamp "slots down, start"
    PYTHONPATH="$BIN" python3 "$BIN/kui/slots.py" >>"$BIN/slots.log" 2>&1 &
    echo $! >"$BIN/slots.pid"
  fi
  if ! alive "$BIN/ovpn-slots.pid"; then
    stamp "ovpn slots down, start"
    PYTHONPATH="$BIN" python3 "$BIN/kui/ovpn_slots.py" >>"$BIN/ovpn-slots.log" 2>&1 &
    echo $! >"$BIN/ovpn-slots.pid"
  fi
  need=0
  alive "$BIN/xray.pid" || need=1
  alive "$BIN/mux.pid" || need=1
  alive "$BIN/cloudflared.pid" || need=1
  if [ "$need" -eq 1 ]; then
    stamp "process down, restart stack"
    bash "$BIN/start.sh" >>"$LOG" 2>&1 || stamp "start.sh failed"
    sleep 4
  elif ! probe; then
    stamp "probe fail, restart stack"
    bash "$BIN/start.sh" >>"$LOG" 2>&1 || stamp "start.sh failed"
    sleep 4
  fi
  sleep "$INTERVAL"
done
