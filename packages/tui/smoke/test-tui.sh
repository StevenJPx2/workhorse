#!/bin/bash
# Quick TUI smoke test using headless terminal (ht)
#
# Usage: ./test-tui.sh
#
# Prerequisites:
#   - Install ht: cargo install --git https://github.com/andyk/ht
#
# This script:
#   1. Starts the TUI in a headless terminal
#   2. Waits for it to render
#   3. Takes a snapshot
#   4. Checks for expected elements

set -e

# Change to the package root (parent of smoke/)
cd "$(dirname "$0")/.."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing TUI with headless terminal (ht)...${NC}"
echo ""

# Check if ht is installed
if ! command -v ht &> /dev/null; then
    echo -e "${RED}Error: 'ht' is not installed.${NC}"
    echo "Install it with: cargo install --git https://github.com/andyk/ht"
    exit 1
fi

# Capture snapshot
echo "Starting TUI and waiting for render..."
RESULT=$( (
  sleep 5
  echo '{"type": "takeSnapshot"}'
  sleep 1
) | timeout 15 ht --size 120x40 --subscribe snapshot bun src/index.tsx 2>&1 | grep '"type":"snapshot"' | jq -r '.data.text' ) || true

# Run assertions
PASSED=0
FAILED=0

check() {
    local name="$1"
    local pattern="$2"
    
    if echo "$RESULT" | grep -q "$pattern"; then
        echo -e "${GREEN}✓${NC} $name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} $name"
        FAILED=$((FAILED + 1))
    fi
}

echo ""
echo "Running checks..."
echo ""

# Note: Without config, we'll see the Setup screen first
# Test for Setup screen elements (first-run experience)
check "Workhorse header" "Workhorse"
check "Setup screen shown" "Setup"
check "Jira plugin config" "jira"
check "Box borders rendered" "┌"
check "Field indicator rendered" "▸"

echo ""
echo "---"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}Snapshot preview:${NC}"
    echo "$RESULT" | head -20
    echo "..."
    exit 1
else
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
fi
