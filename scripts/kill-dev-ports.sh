#!/bin/bash
# Kills any process still bound to this project's dev ports (server 3001, client 5173).
# Run automatically before `npm run dev` because Ctrl+C doesn't reliably reach the
# tsx watch child through the nested npm/concurrently process chain, leaving orphans
# that block the next `npm run dev` with EADDRINUSE.
for port in 3001 5173; do
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "predev: killing stale process on port $port ($pids)"
    kill -9 $pids 2>/dev/null
  fi
done
exit 0
