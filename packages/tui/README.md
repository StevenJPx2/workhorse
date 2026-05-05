# @jiratown/tui

Terminal User Interface for Jiratown - an AI-powered issue management system.

Built with [@opentui/solid](https://github.com/example/opentui) for terminal rendering.

## Development

```bash
# Build the TUI
bun run build

# Run the TUI
bun packages/tui/dist/jiratown.js

# Or run in dev mode
bun packages/tui/src/index.tsx
```

## Testing

### Headless Terminal Testing

We use [headless-terminal](https://github.com/montanaflynn/headless-terminal) (`ht`) for automated TUI testing. This allows testing the full UI rendering and keyboard interactions without a real terminal.

#### Installation

```bash
brew install montanaflynn/tap/ht
```

#### Running Tests

```bash
# Run all tests
./packages/tui/scripts/test-headless.sh

# Run specific test
./packages/tui/scripts/test-headless.sh overview
./packages/tui/scripts/test-headless.sh spawn
./packages/tui/scripts/test-headless.sh navigate
./packages/tui/scripts/test-headless.sh full
```

#### Manual Testing with ht

```bash
# Start a headless session
ht run --name jt --size 120x40 bun packages/tui/dist/jiratown.js

# View the current screen (plain text)
ht view jt --format plain

# View with ANSI colors
ht view jt --format ansi

# Take a screenshot
ht view jt --format png > screenshot.png

# Send keystrokes
ht send jt "<CR>"              # Enter
ht send jt "<Esc>"             # Escape
ht send jt "<Tab>"             # Tab
ht send jt "<Up>"              # Arrow up
ht send jt "<Down>"            # Arrow down
ht send jt "<C-x>h"            # Ctrl+X then h
ht send jt "hello world<CR>"   # Type text then Enter

# Wait for idle after sending keys
ht send jt "<CR>" --wait-idle 500ms

# Stop the session
ht stop jt
ht remove jt
```

#### Key Notation (vim-style)

| Key | Notation |
|-----|----------|
| Enter | `<CR>` or `<Enter>` |
| Escape | `<Esc>` |
| Tab | `<Tab>` |
| Backspace | `<BS>` |
| Space | `<Space>` |
| Arrow keys | `<Up>`, `<Down>`, `<Left>`, `<Right>` |
| Ctrl+X | `<C-x>` |
| Alt/Meta+X | `<M-x>` or `<A-x>` |
| Function keys | `<F1>` through `<F12>` |

## Architecture

### Components

- `src/components/` - Reusable UI components (IssueList, AgentList, SpawnModal, etc.)
- `src/screens/` - Screen-level components (Overview, Agent, Help)
- `src/state/` - Global state management using Solid signals
- `src/bindings/` - Keyboard binding handlers
- `src/primitives/` - Data fetching primitives

### Modal System

Modals in @opentui/solid need to be rendered as siblings of the main content with absolute positioning. The key insight is that:

1. **Don't use Portal** - Portal appends to root after the main content, causing modals to appear below
2. **Render modal as a sibling** - Place the modal `<Show>` before the main content in the parent container
3. **Use absolute positioning** - The modal overlay uses `position="absolute"` to cover the parent

```tsx
// In App.tsx
function App() {
  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Modal layer - rendered first but overlays due to position:absolute + zIndex */}
      <Show when={ui.modal() === "spawn" && ui.spawnIssue()}>
        {(issue) => <SpawnModal issue={issue()} />}
      </Show>

      {/* Main content */}
      <Switch>
        <Match when={ui.screen() === "overview"}>
          <Overview />
        </Match>
      </Switch>
    </box>
  );
}

// SpawnModal component
function SpawnModal(props) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={1000}
      justifyContent="center"
      alignItems="center"
    >
      <box
        flexDirection="column"
        width={50}
        backgroundColor={theme.colors.surface}
        borderStyle="rounded"
        borderColor={theme.colors.accent}
      >
        {/* Modal content */}
      </box>
    </box>
  );
}
```

**Key requirements for modals:**
1. Render modal as a sibling element within the parent container (not via Portal)
2. Use `position="absolute"` with `top={0}`, `left={0}`, `width="100%"`, `height="100%"`
3. Set a high `zIndex` (e.g., 1000) 
4. Use `justifyContent="center"` and `alignItems="center"` to center the dialog
5. The modal will overlay correctly because `position="absolute"` takes it out of flow

### Theme

The theme is defined in `src/theme.ts` using a Gruvbox-inspired color palette.
