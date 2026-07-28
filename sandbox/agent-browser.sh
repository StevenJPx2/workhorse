#!/usr/bin/env bash
# Wrapper for agent-browser: pins the workhorse namespace + JSON output.
#
# There is deliberately NO daemon pre-launch here. `agent-browser daemon start`
# is not a command ("Unknown command: daemon") — the previous version ran it,
# swallowed the error with &>/dev/null, then polled 30 x 0.2s for a socket that
# could never appear, adding ~6s to the first browser call of every run. The
# real CLI auto-launches its background process on demand, so the wrapper only
# needs to fix the flags.
exec agent-browser --namespace workhorse --json "$@"
