#!/usr/bin/env bash
# Spike 4: run the daemon under the OS service manager, probe it, and time restarts.
# Usage: ./service.sh <base>   (run install.ts first)
set -euo pipefail
B=$1
SOCK=$B/sock/daemon.sock

health() { curl -s -o /dev/null -w '%{http_code}' --unix-socket "$SOCK" http://d/health 2>/dev/null || true; }
# Anchored: on Linux the bwrap parent's command line also contains the workerd path.
pid() { pgrep -n -f "^$B/bin/workerd serve" || true; }
now_ms() { perl -MTime::HiRes=time -e 'printf "%d\n", time*1000'; }
wait_new() { # waits for a healthy daemon with a pid other than $1; prints ms elapsed since $2
  while :; do
    # Health first: with socket activation the connection is what starts the daemon.
    if [[ $(health) == 200 ]]; then p=$(pid); [[ -n $p && $p != "$1" ]] && { echo $(( $(now_ms) - $2 )); return; }; fi
    if (( $(now_ms) - $2 > 30000 )); then echo "timeout"; return; fi
    sleep 0.005
  done
}

if [[ $(uname) == Darwin ]]; then
  PLIST=$HOME/Library/LaunchAgents/dev.workhorse.spike4.plist
  start() { launchctl bootstrap "gui/$UID" "$PLIST"; }
  controlled() { launchctl kickstart -k "gui/$UID/dev.workhorse.spike4"; }
else
  start() { systemctl --user daemon-reload; systemctl --user start workhorse-spike4.socket; }
  controlled() { systemctl --user restart workhorse-spike4; }
fi

t=$(now_ms); start; echo "start via service manager: $(wait_new none "$t") ms"
sleep 2
echo "workerd RSS idle: $(( $(ps -o rss= -p "$(pid)") / 1024 )) MB"
echo "counter: $(curl -s --unix-socket "$SOCK" http://d/counter)"
bun probe.ts "$B" sandbox
echo "workerd RSS after probe: $(( $(ps -o rss= -p "$(pid)") / 1024 )) MB"
if [[ $(uname) == Linux ]]; then
  # The daemon's own view of the filesystem, read from the host through /proc.
  for path in /run/nscd/socket /var/run/nscd/socket /run/user/$UID/bus /home "$B/outside"; do
    [[ -e /proc/$(pid)/root$path ]] && seen=visible || seen=absent
    echo "inside sandbox: $path $seen (on host: $([[ -e $path ]] && echo exists || echo missing))"
  done
fi

old=$(pid); t=$(now_ms); kill -9 "$old"; echo "restart after SIGKILL: $(wait_new "$old" "$t") ms"
echo "counter: $(curl -s --unix-socket "$SOCK" http://d/counter)"
sleep 2
old=$(pid); t=$(now_ms); kill -9 "$old"; echo "restart after SIGKILL (2 s later): $(wait_new "$old" "$t") ms"
old=$(pid); t=$(now_ms); controlled; echo "controlled restart: $(wait_new "$old" "$t") ms"
echo "counter: $(curl -s --unix-socket "$SOCK" http://d/counter)"
echo "sandbox still applied after restarts:"
bun probe.ts "$B" sandbox | tail -1
