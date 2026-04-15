#!/bin/bash
# Wrapper script to run the Jiratown MCP server
# Finds mcp-cli.ts relative to this script's own location, so it works
# whether invoked from src/ (dev) or dist/ (installed).

SCRIPT_DIR="$(dirname "$(realpath "$0")")"

# From src/: mcp-cli.ts is alongside this script, jiratown root is one level up
# From dist/: mcp-cli.ts is at ../src/mcp-cli.ts, jiratown root is one level up
JIRATOWN_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$SCRIPT_DIR/mcp-cli.ts" ]; then
  MCP_CLI="$SCRIPT_DIR/mcp-cli.ts"
else
  MCP_CLI="$JIRATOWN_ROOT/src/mcp-cli.ts"
fi

cd "$JIRATOWN_ROOT"
exec /opt/homebrew/bin/bun run "$MCP_CLI" "$@"
