# TUI Testing with Headless Terminal

This directory contains the testing infrastructure for the Workhorse TUI using [ht](https://github.com/andyk/ht) (headless terminal).

## Prerequisites

Install `ht`:

```bash
cargo install --git https://github.com/andyk/ht
```

Make sure `~/.cargo/bin` is in your PATH.

## Quick Test

Run the quick smoke test:

```bash
cd packages/tui
./test-tui.sh
```

## Running the Full Test Suite

```bash
cd packages/tui
bun test/tui.test.ts
```

## How It Works

### The `ht` Tool

`ht` (headless terminal) wraps any binary with a VT100 terminal interface and provides JSON-based control via stdin/stdout. This allows us to:

1. **Start** the TUI in a virtual terminal
2. **Send keys** programmatically (Enter, Tab, arrow keys, text input)
3. **Take snapshots** of the terminal's current state
4. **Assert** on the rendered output

### ht Commands

Commands are sent as JSON to ht's stdin:

```json
// Take a snapshot of current terminal state
{"type": "takeSnapshot"}

// Send keys
{"type": "sendKeys", "keys": ["Tab", "Enter"]}
{"type": "sendKeys", "keys": ["hello", "Enter"]}
{"type": "sendKeys", "keys": ["^c"]}  // Ctrl+C

// Resize terminal
{"type": "resize", "cols": 80, "rows": 24}
```

### ht Events

Events are emitted as JSON to stdout:

```json
// Initial state after launch
{"type": "init", "data": {"cols": 120, "rows": 40, "pid": 12345, "text": "...", "seq": "..."}}

// Snapshot response
{"type": "snapshot", "data": {"cols": 120, "rows": 40, "text": "...", "seq": "..."}}

// Terminal output
{"type": "output", "data": {"seq": "..."}}
```

## Test Harness API

### `captureSnapshot(options)`

Capture a single snapshot of the TUI:

```typescript
import { captureSnapshot } from "./harness.ts";

const snapshot = await captureSnapshot({
  cols: 120,
  rows: 40,
  renderWaitMs: 5000, // Wait for TUI to render
});

console.log(snapshot.text); // Plain text representation
```

### `captureWithKeys(options)`

Send keys and then capture a snapshot:

```typescript
import { captureWithKeys } from "./harness.ts";

const snapshot = await captureWithKeys({
  keys: ["Tab", "Tab", "Enter"],
  renderWaitMs: 3000,
  postKeysWaitMs: 1000,
});
```

### `runTests(tests, options)`

Run a suite of tests:

```typescript
import { runTests, printResults } from "./harness.ts";

const results = await runTests([
  {
    name: "shows header",
    assert: (text) => text.includes("Workhorse") || "Missing header",
  },
  {
    name: "Tab navigates sections",
    keys: ["Tab"],
    assert: (text) => text.includes("focused") || "Focus didn't move",
  },
]);

printResults(results);
```

## Writing Tests

### Basic Assertion Test

```typescript
{
  name: "renders correctly",
  assert: (text) => {
    // Return true for pass
    if (text.includes("Expected")) return true;
    // Return string for failure message
    return "Did not find 'Expected' in output";
  },
}
```

### Keyboard Interaction Test

```typescript
{
  name: "Enter key triggers action",
  keys: ["Enter"],
  assert: (text) => text.includes("Action triggered") || "Action not triggered",
}
```

### Custom Options Per Test

```typescript
{
  name: "works in small terminal",
  options: { cols: 80, rows: 24 },
  assert: (text) => text.includes("Workhorse"),
}
```

## Debugging

### View Raw Snapshot

If a test fails, the snapshot is included in the output. You can also manually capture:

```bash
cd packages/tui
(sleep 5; echo '{"type": "takeSnapshot"}'; sleep 1) | \
  timeout 10 ht --size 120x40 --subscribe snapshot bun src/index.tsx 2>&1 | \
  grep '"type":"snapshot"' | jq -r '.data.text'
```

### Interactive Mode

Run `ht` interactively to see the TUI and manually send commands:

```bash
cd packages/tui
ht --size 120x40 bun src/index.tsx
```

Then type JSON commands:

```json
{ "type": "takeSnapshot" }
```

### Live Preview

`ht` has a built-in HTTP server for live preview:

```bash
cd packages/tui
ht --size 120x40 --listen bun src/index.tsx
```

This prints a URL you can open in a browser to see the terminal in real-time.

## Troubleshooting

### "ht not found"

Install ht:

```bash
cargo install --git https://github.com/andyk/ht
```

### Timeout errors

Increase `renderWaitMs` or `timeoutSec` in test options. The TUI needs time to:

1. Bootstrap core services
2. Initialize database
3. Render components

### Snapshot is blank

The TUI may not have rendered yet. Increase `renderWaitMs`.

### "Failed to capture snapshot"

Check that:

1. The TUI starts without errors: `cd packages/tui && bun src/index.tsx`
2. `ht` is working: `echo '{"type":"takeSnapshot"}' | ht --subscribe snapshot echo hello`

## CI Integration

For CI, you may want to:

1. Install ht in the CI environment
2. Increase timeouts for slower CI machines
3. Use a fixed terminal size for consistent snapshots

```yaml
# Example GitHub Actions step
- name: Install ht
  run: cargo install --git https://github.com/andyk/ht

- name: Run TUI tests
  run: |
    cd packages/tui
    bun test/tui.test.ts
```
