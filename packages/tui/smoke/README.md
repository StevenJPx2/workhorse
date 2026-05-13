# TUI Smoke Tests

Quick visual tests for the TUI using a headless terminal.

## Prerequisites

Install `ht` (headless terminal):

```bash
cargo install --git https://github.com/andyk/ht
```

## Running Tests

```bash
./smoke/test-tui.sh
```

## What It Tests

The smoke test:
1. Starts the TUI in a headless terminal (`ht`)
2. Waits for rendering to complete
3. Takes a snapshot of the terminal output
4. Checks for expected UI elements

### Current Checks (Setup Screen)

Without a config file, the TUI shows the Setup screen. The test verifies:

- **Workhorse header** - The app title is visible
- **Setup screen shown** - The setup wizard appears
- **Jira plugin config** - Plugin configuration is displayed
- **Box borders rendered** - UI borders render correctly (┌)
- **Field indicator rendered** - Selection indicator works (▸)

## OpenTUI Rendering Notes

**IMPORTANT:** When writing TUI components with `@opentui/solid`, follow these rules to avoid rendering issues:

### 1. `<text>` Element Content

`<text>` can contain:
- Plain strings
- `<b>` tags (bold/styled text)

`<text>` CANNOT contain:
- Other `<text>` elements
- `<Show>`, `<For>`, or other control flow components

❌ **Wrong:**
```tsx
<text>
  <text fg="red">Error:</text> Something went wrong
</text>
```

✅ **Correct:**
```tsx
<box flexDirection="row">
  <text fg="red">Error:</text>
  <text> Something went wrong</text>
</box>
```

### 2. Sibling `<text>` Elements

Multiple `<text>` elements need `<box>` wrappers to render on separate lines:

❌ **Wrong:** (may cause overlapping text)
```tsx
<box flexDirection="column">
  <text>Line 1</text>
  <text>Line 2</text>
</box>
```

✅ **Correct:**
```tsx
<box flexDirection="column">
  <box><text>Line 1</text></box>
  <box><text>Line 2</text></box>
</box>
```

### 3. Dynamic Content in `<b>` Tags

Build strings outside JSX to avoid rendering issues:

❌ **Wrong:**
```tsx
<text>
  <b>{isSelected ? "▸ " : "  "}{label}{required ? " *" : ""}</b>
</text>
```

✅ **Correct:**
```tsx
const labelText = `${isSelected ? "▸ " : "  "}${label}${required ? " *" : ""}`;
// ...
<text><b>{labelText}</b></text>
```

### 4. Control Flow Inside Text

Move `<Show>` outside of `<text>`:

❌ **Wrong:**
```tsx
<text>
  Value: <Show when={value}>{value}</Show>
</text>
```

✅ **Correct:**
```tsx
<Show when={value} fallback={<text>Value: (none)</text>}>
  <text>Value: {value}</text>
</Show>
```

## Debugging Rendering Issues

If you see garbled/overlapping text:

1. **Run the smoke test** to capture a clean snapshot:
   ```bash
   ./smoke/test-tui.sh
   ```

2. **Check raw terminal output** for escape code issues:
   ```bash
   bun src/index.tsx 2>&1 &
   PID=$!
   sleep 2
   kill $PID
   ```

3. **Use `ht` directly** to capture a snapshot:
   ```bash
   (sleep 3; echo '{"type": "takeSnapshot"}'; sleep 0.5) | \
     timeout 8 ht --size 100x30 --subscribe snapshot bun src/index.tsx 2>&1 | \
     grep '"type":"snapshot"' | jq -r '.data.text'
   ```

4. Look for interleaved characters in the output - this indicates `<text>` elements are rendering on the same line.
