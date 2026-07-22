#!/usr/bin/env bash
# Lazy launcher + wrapper for agent-browser.
# First call starts the daemon (~800ms); subsequent calls reuse the socket.
DAEMON_DIR="${AGENT_BROWSER_NAMESPACE:-$HOME/.agent-browser}"
SOCK="$DAEMON_DIR/daemon.sock"
mkdir -p "$DAEMON_DIR"
if [ ! -S "$SOCK" ]; then
  agent-browser --namespace workhorse daemon start &>/dev/null &
  for _ in $(seq 1 30); do
    [ -S "$SOCK" ] && break
    sleep 0.2
  done
fi
exec agent-browser --namespace workhorse --json "$@"
