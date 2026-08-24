#!/bin/sh
set -eu
cd /workspace
if ! curl -sf -o /dev/null --max-time 1 http://127.0.0.1:38079/vless; then
  bash /workspace/proxy-bin/start.sh >>/tmp/proxy-startup.log 2>&1
fi
if [ -f /workspace/proxy-bin/supervise.pid ] && kill -0 "$(cat /workspace/proxy-bin/supervise.pid)" 2>/dev/null; then
  :
else
  bash /workspace/proxy-bin/supervise.sh >>/workspace/proxy-bin/supervise.log 2>&1 &
  echo $! >/workspace/proxy-bin/supervise.pid
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
