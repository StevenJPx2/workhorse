#!/usr/bin/env bash
# Wrapper for agent-browser: pins the workhorse namespace, JSON output, and a
# HEADFUL browser on a virtual X display.
#
# Headful is the point. Bot-detection vendors (PerimeterX and similar) deny
# headless Chrome outright — measured against talbots.com, headless is blocked
# 3/3 while headful passes 3/3. Chrome headful needs an X display on Linux
# (without DISPLAY it fails to launch), so this starts Xvfb once per container
# and points the browser at it.
#
# AGENT_BROWSER_HEADED=1 rather than the --headed flag: `batch` SILENTLY DROPS
# --headed. Verified by launchHash — `batch --bail "open <url> --headed"`
# produces the identical hash to a headless launch, and the page comes back
# blocked. The env var is read at launch regardless of which subcommand runs,
# so it survives batch. browser_open uses batch for open+wait, so the flag
# form would have been silently useless there.
#
# There is deliberately NO daemon pre-launch. `agent-browser daemon start` is
# not a command ("Unknown command: daemon") — a previous version ran it,
# swallowed the error with &>/dev/null, then polled 30 x 0.2s for a socket that
# could never appear, adding ~6s to the first browser call of every run. The
# real CLI auto-launches its background process on demand.

set -u

DISPLAY_NUM="${WORKHORSE_XVFB_DISPLAY:-99}"
XVFB_LOCK="/tmp/.X${DISPLAY_NUM}-lock"

# Start Xvfb once per container. The lock file is X's own mutex, so its presence
# means a display is already up — checking it keeps repeated tool calls cheap.
if [ ! -e "$XVFB_LOCK" ] && command -v Xvfb >/dev/null 2>&1; then
  Xvfb ":${DISPLAY_NUM}" -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 &
  # Wait for the display to accept connections rather than sleeping a fixed
  # amount: Chrome fails hard if DISPLAY is set but not yet listening.
  for _ in $(seq 1 50); do
    [ -e "$XVFB_LOCK" ] && break
    sleep 0.1
  done
fi

# Only claim a display that actually came up. Pointing Chrome at a dead DISPLAY
# is worse than headless — it cannot launch at all, where headless at least
# works on sites that don't bot-check.
if [ -e "$XVFB_LOCK" ]; then
  export DISPLAY=":${DISPLAY_NUM}"
  export AGENT_BROWSER_HEADED=1
fi

exec agent-browser --namespace workhorse --json "$@"
