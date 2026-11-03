#!/bin/sh
# Double-click on the Mac mini, or run: sh Start.command
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3.9+ is required. Install Python 3, then run this launcher again.'
  read -r _answer
  exit 1
fi
printf '%s\n' 'Starting QUEST//OS for your local network. Keep this Terminal window open.'
exec python3 server.py --host 0.0.0.0 --port 8080
