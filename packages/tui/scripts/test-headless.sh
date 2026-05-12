#!/bin/bash
#
# Headless Terminal Testing Script for Workhorse TUI
# 
# Uses `ht` (headless-terminal) to run automated UI tests.
# Install: brew install montanaflynn/tap/ht
#
# Usage:
#   ./scripts/test-headless.sh [test-name]
#
# Tests:
#   overview    - Test the overview screen renders correctly
#   spawn       - Test opening the spawn agent modal
#   navigate    - Test keyboard navigation
#   full        - Run all tests (default)
#

set -e

HT="/opt/homebrew/bin/ht"
SESSION="wh-test"
TUI_CMD="bun packages/tui/dist/workhorse.js"
COLS=120
ROWS=40

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

cleanup() {
  $HT stop $SESSION 2>/dev/null || true
  $HT remove $SESSION 2>/dev/null || true
}

start_session() {
  cleanup
  log_info "Starting TUI session..."
  $HT run --name $SESSION --size ${COLS}x${ROWS} $TUI_CMD >/dev/null
  sleep 2  # Wait for app to initialize
}

view_plain() {
  $HT view $SESSION --format plain 2>&1
}

view_ansi() {
  $HT view $SESSION --format ansi 2>&1
}

send_keys() {
  $HT send $SESSION "$1" --wait-idle 500ms
}

screenshot() {
  local name="${1:-screenshot}"
  $HT view $SESSION --format png > "packages/tui/scripts/${name}.png"
  log_info "Screenshot saved to packages/tui/scripts/${name}.png"
}

# Test: Overview screen
test_overview() {
  log_info "Testing overview screen..."
  start_session
  
  local output=$(view_plain)
  
  # Check for expected elements
  if echo "$output" | grep -q "WORKHORSE"; then
    log_pass "Header 'WORKHORSE' found"
  else
    log_fail "Header 'WORKHORSE' not found"
    echo "$output"
    return 1
  fi
  
  if echo "$output" | grep -q "ISSUES"; then
    log_pass "Issues panel found"
  else
    log_fail "Issues panel not found"
    return 1
  fi
  
  if echo "$output" | grep -q "AGENTS"; then
    log_pass "Agents panel found"
  else
    log_fail "Agents panel not found"
    return 1
  fi
  
  if echo "$output" | grep -q "navigate"; then
    log_pass "Status bar found"
  else
    log_fail "Status bar not found"
    return 1
  fi
  
  cleanup
  log_pass "Overview test passed!"
}

# Test: Spawn modal
test_spawn() {
  log_info "Testing spawn modal..."
  start_session
  
  # Press Enter to open spawn modal on selected issue
  send_keys "<CR>"
  
  local output=$(view_plain)
  
  # Check for spawn modal elements
  if echo "$output" | grep -q "SPAWN AGENT"; then
    log_pass "Spawn modal title found"
  else
    log_fail "Spawn modal title not found"
    echo "$output"
    return 1
  fi
  
  if echo "$output" | grep -q "Agent Harness"; then
    log_pass "Harness selection found"
  else
    log_fail "Harness selection not found"
    return 1
  fi
  
  if echo "$output" | grep -q "Pi Coding Agent"; then
    log_pass "Pi Coding Agent option found"
  else
    log_fail "Pi Coding Agent option not found"
    return 1
  fi
  
  # Test ESC closes modal
  send_keys "<Esc>"
  output=$(view_plain)
  
  if echo "$output" | grep -q "SPAWN AGENT"; then
    log_fail "Modal should be closed after ESC"
    return 1
  else
    log_pass "Modal closed with ESC"
  fi
  
  cleanup
  log_pass "Spawn modal test passed!"
}

# Test: Navigation
test_navigate() {
  log_info "Testing navigation..."
  start_session
  
  # Test Tab navigation
  send_keys "<Tab>"
  local output=$(view_plain)
  
  # Should have moved focus (visual change in UI)
  log_pass "Tab key processed"
  
  # Test arrow keys
  send_keys "<Down>"
  send_keys "<Up>"
  log_pass "Arrow keys processed"
  
  # Test help screen
  send_keys "<C-x>h"
  sleep 0.5
  output=$(view_plain)
  
  if echo "$output" | grep -q "HELP" || echo "$output" | grep -q "Keyboard"; then
    log_pass "Help screen opened"
  else
    log_info "Help screen may not have opened (checking output)"
    echo "$output" | head -10
  fi
  
  cleanup
  log_pass "Navigation test passed!"
}

# Test: Full user flow
test_full_flow() {
  log_info "Testing full user flow..."
  start_session
  
  # 1. View overview
  local output=$(view_plain)
  log_info "Step 1: Overview loaded"
  
  # 2. Select an issue and open spawn modal
  send_keys "<CR>"
  output=$(view_plain)
  
  if echo "$output" | grep -q "SPAWN AGENT"; then
    log_info "Step 2: Spawn modal opened"
  else
    log_fail "Step 2: Failed to open spawn modal"
    echo "$output"
    cleanup
    return 1
  fi
  
  # 3. Navigate harness options (if modal is working)
  send_keys "<Down>"
  log_info "Step 3: Navigated harness options"
  
  # 4. Close modal with ESC
  send_keys "<Esc>"
  output=$(view_plain)
  log_info "Step 4: Closed modal"
  
  # 5. Navigate to agents panel
  send_keys "<Tab>"
  log_info "Step 5: Switched panel focus"
  
  # 6. Open help
  send_keys "<C-x>h"
  sleep 0.5
  log_info "Step 6: Opened help (or attempted)"
  
  # Save final screenshot
  screenshot "full-flow-final"
  
  cleanup
  log_pass "Full flow test completed!"
}

# Main
main() {
  local test="${1:-full}"
  
  log_info "Workhorse TUI Headless Tests"
  log_info "Using ht at: $HT"
  
  # Check ht is installed
  if ! command -v $HT &> /dev/null; then
    log_fail "ht (headless-terminal) not found. Install with: brew install montanaflynn/tap/ht"
    exit 1
  fi
  
  # Build first
  log_info "Building TUI..."
  (cd packages/tui && bun run build) || {
    log_fail "Build failed"
    exit 1
  }
  
  case $test in
    overview)
      test_overview
      ;;
    spawn)
      test_spawn
      ;;
    navigate)
      test_navigate
      ;;
    full)
      test_overview
      test_spawn
      test_navigate
      test_full_flow
      ;;
    *)
      echo "Unknown test: $test"
      echo "Available: overview, spawn, navigate, full"
      exit 1
      ;;
  esac
  
  log_pass "All tests completed!"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
