# `src/tui` — Terminal User Interface

The **tui** module is the visual layer of Jiratown.  
Built with [OpenTUI](https://github.com/anomalyco/opentui) (terminal rendering engine) and [Solid.js](https://solidjs.com) (reactive UI framework).

It renders the full multi-pane terminal dashboard, handles keyboard input and navigation, manages UI state via Solid.js reactive primitives, and bridges user actions to the `src/core` SDK.

---

## Module Map

```
src/tui/
├── app/                        ← Application shell
│   ├── app.tsx                 ← Root component (providers stack)
│   ├── app-content.tsx         ← Main dashboard logic + context wiring
│   ├── layout.tsx              ← Shell: sidebar + main + footer
│   ├── commands.ts             ← Command palette command definitions
│   ├── commands.test.ts
│   ├── empty-state.tsx         ← Shown when no tickets loaded
│   ├── help-dialog.tsx         ← Keyboard shortcut reference overlay
│   └── use-ticket-actions.ts   ← Per-ticket action bindings (stop/start/escalate)
│
├── components/                 ← Reusable UI components
│   ├── button/                 ← Button, ActionBar, ButtonGroup, KeyHint, icons
│   ├── card/                   ← Card container with optional border
│   ├── chat-box/               ← Agent feedback text input + message history
│   ├── command-palette/        ← Fuzzy-search command launcher (: key)
│   ├── dialog/                 ← Generic centered dialog overlay
│   ├── divider/                ← Horizontal/vertical separator
│   ├── grid/                   ← 2D grid layout with keyboard navigation
│   ├── modal/                  ← Modal dialog with escape-to-close
│   ├── notification-bar/       ← Footer notification badge + count
│   ├── select/                 ← Radio / single-select list
│   ├── status-badge/           ← Ticket status chip + agent badge
│   ├── text-input/             ← Single-line text input with edit mode
│   ├── theme-switcher/         ← Theme cycling select
│   ├── ticket-input/           ← New-ticket modal (key + agent select)
│   ├── ticket-pane/            ← Main ticket detail view (right panel)
│   └── ticket-sidebar/        ← Ticket list (left sidebar)
│
├── contexts/                   ← Solid.js context providers
│   ├── tickets-context.tsx     ← Tickets list + selection + CRUD actions
│   ├── keyboard-context.ts     ← Input mode management (normal vs edit)
│   ├── keyboard-provider.tsx
│   ├── navigation-context.ts   ← Navigation lock system (prevents key conflicts)
│   ├── navigation-provider.tsx
│   ├── event-log-context.tsx   ← Per-ticket event log reactive store
│   ├── ticket-actions-context.tsx ← Bound ticket action callbacks
│   └── workflow-context.tsx    ← Agent workflow (spawn/stop/message)
│
├── hooks/                      ← Solid.js hooks (composables)
│   ├── use-agent-progress/     ← Agent session memory + progress display
│   ├── use-atlassian/          ← Atlassian MCP client (reactive wrapper)
│   ├── use-command-palette/    ← Command palette state + keyboard
│   ├── use-config/             ← Reactive config load/save
│   ├── use-database/           ← SQLite connection lifecycle hook
│   ├── use-focus-zone/         ← Focus region activation/deactivation
│   ├── use-layout-actions/     ← Top-level layout action handlers
│   ├── use-modal/              ← Modal open/close/toggle state
│   ├── use-notifications/      ← Notification CRUD + polling
│   ├── use-selection/          ← List selection (index, item, navigation)
│   ├── use-tmux/               ← tmux session management hook
│   └── use-worktree/           ← git worktree management hook
│
├── theme/                      ← Theme system
│   ├── types.ts                ← Theme interface definition
│   ├── context.tsx             ← ThemeProvider + useTheme hook
│   ├── tokyonight.ts           ← Tokyo Night color scheme
│   ├── gruvbox.ts              ← Gruvbox color scheme
│   ├── colors.ts               ← Shared color palette constants
│   ├── presets.ts              ← Spacing, border styles
│   ├── status.ts               ← Status/agent state → color/icon mapping
│   ├── utils.ts                ← getAgentColor, formatKeyHint, createDivider
│   └── index.ts                ← Public exports
│
└── sandbox/                    ← Visual testing & development environment
    ├── index.tsx               ← Sandbox app entry point
    ├── sandbox-app/            ← Sandbox shell with demo menu
    ├── demos/                  ← Interactive component demos
    ├── dump-frames/            ← Frame capture for snapshot testing
    └── __tests__/              ← Visual integration tests
```

---

## Application Architecture

### Provider Stack

The `<App>` component establishes a layered provider stack. Providers at the top are available to all descendants:

```
<ThemeProvider>           ← theme signal + setTheme
  <NavigationProvider>    ← navigation lock system
    <KeyboardProvider>    ← input mode state
      <ModalSystemProvider> ← global modal registry
        <WorkflowProvider>  ← agent workflow (spawn/stop/send)
          <TicketsProvider> ← ticket list + selection state
            <EventLogProvider> ← per-ticket event log
              <Layout />     ← sidebar + main + footer
                <TicketPane /> or <EmptyState />
```

### Data Flow

```
Core SDK (SQLite, tmux, git)
       ↑
   Hooks (useDatabase, useTmux, useWorktree, useAtlassian)
       ↑
   Contexts (TicketsContext, WorkflowContext, EventLogContext)
       ↑
   App (AppContent wires contexts → handlers)
       ↑
   Components (Layout, TicketSidebar, TicketPane, ...)
```

---

## Key Components

### `<App>` — Root component (`app/app.tsx`)

Mounts all global providers. Loads config on startup and passes the initial theme to `ThemeProvider`.

```tsx
<App showAll={false} initialTheme="tokyonight" />
```

### `<Layout>` — Dashboard shell (`app/layout.tsx`)

The outer shell containing:
- **Sidebar** (`<TicketSidebar>`) — left panel, ticket list
- **Main content** — center/right, children slot
- **Footer bar** — notification count, keyboard hint strip

Registers all global keyboard shortcuts:

| Key | Action |
|---|---|
| `n` / `+` | Open new ticket modal |
| `x` | Close current ticket |
| `o` | Open ticket in Jira (browser) |
| `e` | Escalate to Jira |
| `a` | Switch agent (opencode ↔ claude) |
| `s` | Toggle agent (start/stop) |
| `t` | Cycle theme |
| `q` | Quit |
| `?` | Toggle help dialog |
| `:` / `;` | Open command palette |

### `<TicketSidebar>` — Left panel (`components/ticket-sidebar/`)

Displays the list of open tickets. Each ticket item shows:
- Status indicator (color-coded)
- Ticket ID (truncated)
- Agent badge

Supports keyboard navigation (`j`/`k`, `↑`/`↓`) and click selection. Emits `onSelect(index)` and `onNew()`.

### `<TicketPane>` — Main ticket detail view (`components/ticket-pane/`)

The right panel showing full details for the selected ticket:

| Sub-component | Purpose |
|---|---|
| `<TicketHeader>` | Ticket ID + summary title |
| `<TicketMeta>` | Status badge, agent badge, worktree path, branch |
| `<ProgressLog>` | Chronological event log (shown when agent not active) |
| `<FileChanges>` | Modified files with +/- line counts |
| `<AgentDisplay>` | Agent activity summary from OpenCode SDK (LLM steps) |
| `<AgentProgress>` | Session memory-based progress (from `.jiratown/context.md`) |
| `<TicketActions>` | Action bar (switch agent, stop/start) |
| `<ChatBox>` | Press `i` to send a feedback message to the agent |

### `<TicketInput>` — New ticket modal (`components/ticket-input/`)

Opens when user presses `n`/`+`. Contains:
- Text input for ticket key or full Jira URL
- Agent selection radio (OpenCode / Claude)
- Live Jira fetch on input (validates ticket exists)
- `onSubmit(key, agent, jiraIssue)` callback

### `<CommandPalette>` — Command launcher (`components/command-palette/`)

Activated with `:` or `;`. Supports:
- Action commands (single-level, executed immediately)
- Submenu commands (nested, e.g., Theme → Tokyo Night / Gruvbox / Default)
- Keyboard: `↑`/`↓` to navigate, `Enter` to execute, `Esc` to close, `Backspace` to go up

---

## Hooks Reference

### Data Hooks

#### `useAtlassian(options)` — Atlassian MCP client

Reactive wrapper around `AtlassianClient`. Manages connection state and deduplicates concurrent connect calls.

```ts
const atlassian = useAtlassian({
  cloudId: () => config.config()?.jira.cloud_id,  // reactive getter
  autoConnect: false,
  onError: (err) => console.error(err),
});

// Returns
atlassian.isConnected()         // Accessor<boolean>
atlassian.isConnecting()        // Accessor<boolean>
atlassian.error()               // Accessor<Error | null>
await atlassian.connect()
await atlassian.disconnect()
await atlassian.fetchIssue("AM-123")    // → JiraIssue
await atlassian.addComment("AM-123", "body")
await atlassian.transitionIssue("AM-123", "transitionId")
```

`cloudId` accepts either a `string` or a `() => string | undefined` getter — the latter allows reactive config loading.

#### `useConfig(options)` — Reactive config

```ts
const config = useConfig({ autoLoad: true });

config.config()           // Accessor<ResolvedConfig | null>
config.status()           // Accessor<"idle" | "loading" | "loaded" | "error">
await config.load()
await config.saveGlobal(partial)
await config.saveProject(partial)
await config.setTheme("gruvbox")
config.theme()            // Accessor<ThemeName>
config.agent()            // Accessor<AgentType>
config.cloudId()          // Accessor<string | undefined>
```

#### `useDatabase(options)` — SQLite lifecycle

```ts
const db = useDatabase({ autoInit: true, onError: ... });

db.isConnected()          // Accessor<boolean>
db.status()               // Accessor<DatabaseStatus>
db.db()                   // Accessor<Database | null>
db.exec(sql)
db.queryAll<T>(sql, params?)   // → T[]
db.queryOne<T>(sql, params?)   // → T | null
db.run(sql, params?)
```

#### `useNotifications(options)` — Notification management

```ts
const notifs = useNotifications({
  ticketId: () => currentTicket()?.id,
  autoLoad: true,
  pollInterval: 5_000,
});

notifs.notifications()       // Accessor<Notification[]>
notifs.unreadCount()         // Accessor<number>
notifs.hasBlocking()         // Accessor<boolean>
await notifs.create(input)
notifs.markRead(id)
notifs.acknowledge(id)
notifs.acknowledgeMany(ids)
notifs.remove(id)
notifs.startPolling()
notifs.stopPolling()
```

### UI State Hooks

#### `useSelection<T>(options)` — List selection

```ts
const selection = useSelection<Ticket>({
  items: () => tickets(),
  wrap: true,
  initialIndex: 0,
});

selection.selectedIndex()    // Accessor<number>
selection.selectedItem()     // Accessor<T | undefined>
selection.isSelected(i)      // Accessor<boolean>
selection.select(i)
selection.selectNext()
selection.selectPrev()
selection.selectFirst()
selection.selectLast()
selection.selectByKey(predicate)
selection.clear()
```

#### `useModal(options)` — Modal state

```ts
const modal = useModal({ onOpen: ..., onClose: ... });

modal.isOpen()    // Accessor<boolean>
modal.open()
modal.close()
modal.toggle()
```

#### `useFocusZone(id, options)` — Focus regions

```ts
const zone = useFocusZone("sidebar", { onActivate: ..., onDeactivate: ... });

zone.isActive()   // Accessor<boolean>
zone.activate()
zone.deactivate()
zone.toggle()
```

#### `useCommandPalette(options)` — Command palette state

```ts
const palette = useCommandPalette({ commands: commands() });

palette.isOpen()           // Accessor<boolean>
palette.query()            // Accessor<string>
palette.filteredCommands() // Accessor<Command[]>
palette.selectedIndex()    // Accessor<number>
palette.open()
palette.close()
palette.toggle()
palette.selectNext()
palette.selectPrevious()
palette.appendToQuery(char)
palette.backspace()
palette.executeSelected()
palette.goBack()           // exit submenu
```

### Session Hooks

#### `useTmux(options)` — tmux session management

```ts
const tmux = useTmux({ ticketId: "AM-123", onChange: ... });

tmux.sessions()         // Accessor<TmuxSession[]>
tmux.isAvailable()      // Accessor<boolean>
await tmux.create(worktreePath)
await tmux.kill()
await tmux.exists()     // → boolean
await tmux.sendKeys(keys, enterAfter?)
await tmux.capture()    // → string | null
```

#### `useWorktree(options)` — git worktree management

```ts
const worktree = useWorktree({
  repoPath: () => gitRoot(),
  onError: (err) => console.error(err),
});

await worktree.create(ticketId, issueType?, baseBranch?)
await worktree.remove(ticketId, force?)
await worktree.exists(ticketId)
await worktree.get(ticketId)         // → Worktree | null
worktree.reload()
worktree.worktrees()                 // Accessor<Worktree[]>
```

#### `useAgentProgress(options)` — Session memory reader

Reads `.jiratown/context.md` from the agent's worktree and exposes a reactive `AgentProgressInfo` object showing status, branch, duration, recent activity, and key decisions.

```ts
const progress = useAgentProgress({
  ticketId: () => ticket.id,
  worktreePath: () => ticket.worktree_path,
  agentState: () => "running",
  pollInterval: 5_000,
});

progress.progress()   // Accessor<AgentProgressInfo>
progress.refresh()
```

#### `useLayoutActions(options)` — Top-level action wiring

```ts
const actions = useLayoutActions({
  currentTicketId: () => currentTicket()?.id,
  reloadTickets: () => ticketActions.reload(),
  onQuit: () => renderer.destroy(),
});

actions.addTicket()
actions.closeTicket()
actions.openInJira()
actions.escalate()
actions.switchAgent()
actions.toggleAgent()   // start or stop current ticket's agent
actions.quit()
```

---

## Theme System

### Available Themes

| Name | Description |
|---|---|
| `tokyonight` | Dark purple/blue Tokyo Night palette |
| `gruvbox` | Warm retro Gruvbox palette |
| `default` | Clean neutral default |

### Using the Theme

```ts
import { useTheme, spacing } from "../theme/index.ts";

const { theme, themeName, setTheme, toggleTheme } = useTheme();

// In JSX
<box backgroundColor={theme().bg.base} fg={theme().text.primary}>
  <text fg={theme().status.implementing}>Implementing</text>
</box>
```

### Theme Shape

```ts
interface Theme {
  primary: Color;         // brand accent
  bg: {
    shell: Color;         // outermost terminal background
    base: Color;          // main content background
    elevated: Color;      // sidebar + footer
    highlight: Color;     // selected items
    input: Color;         // text input background
  };
  text: {
    primary: Color;
    secondary: Color;
    dim: Color;
    inverse: Color;
  };
  border: { default, focus, dim };
  status: {
    pending, queued, planning, implementing, blocked,
    pr_created, in_review, done
  };
  success, warning, error, info;           // + Bright variants
  agent: { opencode, claude };
}
```

### Status Colors

```ts
import { getStatusConfig, getAgentStateConfig } from "../theme/status.ts";

const statusCfg = getStatusConfig("implementing");
// → { color: "#...", indicator: "▶", label: "Implementing" }

const agentCfg = getAgentStateConfig("running");
// → { color: "#...", indicator: "⬤", label: "Running" }
```

### Spacing + Border Presets

```ts
import { spacing, borderStyles, presets } from "../theme/presets.ts";

spacing.xs   // 0
spacing.sm   // 1
spacing.md   // 2
spacing.lg   // 4

borderStyles.single   // { topLeft: "╭", ... }
borderStyles.double   // { topLeft: "╔", ... }
```

---

## Context Reference

### `TicketsContext`

Access anywhere inside `<TicketsProvider>`:

```ts
const { tickets, isLoading, selection, currentTicket, actions } = useTicketsContext();

tickets()                         // Accessor<Ticket[]>
currentTicket()                   // Accessor<Ticket | undefined>
selection.selectedIndex()
selection.select(i)
actions.reload()
actions.create({ jiraKey, rig, summary, agent, jiraUrl })
actions.update(id, fields)
actions.remove(id)                // adjusts selection automatically
```

### `KeyboardContext`

Manages the `"normal"` vs `"edit"` input mode. When in edit mode, global keyboard shortcuts are suppressed so text inputs can capture keystrokes.

```ts
const keyboard = useKeyboardContext();

keyboard.isInputMode()               // Accessor<boolean>
keyboard.hasInputFocus(inputId)      // Accessor<boolean>
keyboard.enterInputMode(inputId)
keyboard.exitInputMode(inputId?)
```

### `NavigationContext`

A lock system that prevents keyboard conflicts when overlays (modals, submenus) are active.

```ts
const navigation = useNavigation();

navigation.isLocked()                // Accessor<boolean>
const lock = navigation.acquireLock("chat-input");
// ...user interacts with chat...
lock.release();
```

### `WorkflowContext`

High-level agent workflow operations:

```ts
const workflow = useWorkflowContext();

await workflow.startWork({ ticketId, agent, jiraIssue })
await workflow.stopWork({ ticketId, removeWorktree? })
await workflow.restartAgent(ticketId)
await workflow.sendToAgent(ticketId, message)
workflow.getAgentState(ticketId)     // → AgentState
```

### `EventLogContext`

Reactive per-ticket event log consumed by `<ProgressLog>` and `<FileChanges>`:

```ts
const { eventLog, useCurrentTicketEvents } = useEventLogContext();

eventLog.events()                    // Accessor<TicketEvent[]>
const events = useCurrentTicketEvents();  // shortcut
```

---

## Keyboard Architecture

OpenTUI provides `useKeyboard(handler)` from `@opentui/solid`. Components register their own keyboard handlers. The system uses two mechanisms to prevent conflicts:

1. **Input mode** (`KeyboardContext`) — When a text input is focused, `keyboard.isInputMode()` returns `true`. All keyboard handlers should bail early when this is true.

2. **Navigation lock** (`NavigationContext`) — When a modal or nested component needs exclusive keyboard control, it acquires a lock. Other handlers check `navigation.isLocked()` and bail.

```ts
// Pattern used in every keyboard-sensitive component
useKeyboard((key) => {
  if (navigation.isLocked()) return;    // another component owns keyboard
  if (keyboard.isInputMode()) return;   // text input has focus

  if (key.name === "n") actions.addTicket();
  // ...
});
```

---

## Sandbox (`sandbox/`)

The sandbox is a development/testing environment for UI components.

```bash
# Run interactive sandbox with demo menu
bun run sandbox

# Dump terminal frames for snapshot comparison
bun run frames
```

### Component Demos (`sandbox/demos/`)

Each component has a standalone demo: `button-demo.tsx`, `select-demo.tsx`, `ticket-input-demo.tsx`, etc. The demo menu in `SandboxApp` lists all available demos.

### Snapshot Tests (`sandbox/__tests__/`)

Integration tests that render the full UI with mock data and verify terminal frame output. Run with:

```bash
bun test src/tui/sandbox
```

### Test Utilities (`sandbox/test-helper.tsx`)

```ts
import { renderWithProviders, renderLayoutWithProviders, createMockWorkflow } from "./test-helper.tsx";

// Render a component inside all providers
const { container } = renderWithProviders(<MyComponent />, {
  theme: "tokyonight",
  initialTickets: [makeTicket("AM-123")],
});

// Render the full Layout shell
const { container } = renderLayoutWithProviders(content, {
  rig: "github.com/user/repo",
  tickets: [makeTicket("AM-123")],
});
```
