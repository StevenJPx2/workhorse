#!/bin/bash
# Wrapper script to run the Jiratown MCP server
# This ensures bun runs from the jiratown directory so it finds the right dependencies

JIRATOWN_ROOT="${JIRATOWN_ROOT:-$(dirname "$(dirname "$(realpath "$0")")")}"
cd "$JIRATOWN_ROOT"
exec /opt/homebrew/bin/bun run "$JIRATOWN_ROOT/src/mcp-cli.ts" "$@"
