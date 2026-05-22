# workhorse-tui

Terminal UI for Workhorse — a reactive interface for managing AI coding agents.

## Installation

**Requires [Bun](https://bun.sh) runtime** (v1.0+)

```bash
# Install bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install workhorse globally
bun i -g @fdcn/workhorse
```

> **Note**: Workhorse requires Bun as its runtime due to dependencies on Bun-specific features in the terminal UI framework.

## What This Package Does

This package provides the interactive terminal interface for Workhorse:

- **Multi-screen navigation** — Overview, agent detail, help
- **Issue/agent management** — Spawn, monitor, stop agents
- **Live activity feed** — Watch agents work in real-time
- **Chat interface** — Send messages to running agents
- **OAuth flows** — Guided setup for Jira/GitHub authentication

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            TUI                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      Screens                             │    │
│  │  Overview (issues | agents) │ Agent Detail │ Help       │    │
│  └───────────────────────────────────┬─────────────────────┘    │
│                                      │                           │
│  ┌───────────────────────────────────┼─────────────────────┐    │
│  │                     Components    │                      │    │
│  │  IssueList │ AgentList │ ActivityFeed │ ChatBox         │    │
│  │  SpawnModal │ ModelSelectorModal │ DeleteModal          │    │
│  └───────────────────────────────────┼─────────────────────┘    │
│                                      │                           │
│  ┌───────────────────────────────────┼─────────────────────┐    │
│  │                   Primitives      ▼                      │    │
│  │  createAgents │ createIssues │ createChat │ createActivity│   │
│  │  createMonitors │ createFileChanges                      │    │
│  └───────────────────────────────────┬─────────────────────┘    │
│                                      │                           │
│  ┌───────────────────────────────────┼─────────────────────┐    │
│  │                  Renderers        │                      │    │
│  │  Plugin-extensible activity rendering                    │    │
│  │  RendererRegistry → ActivityInput → RenderedActivity     │    │
│  └───────────────────────────────────┴─────────────────────┘    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 WorkhorseProvider                        │    │
│  │  config, hooks, tracker, orchestrator, memory, monitors  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       workhorse-core                             │
│  bootstrap() → { hooks, tracker, orchestrator, ... }            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Abstractions

### Screens

```typescript
type Screen = "overview" | "agent" | "help";
```

| Screen   | Layout                     | Purpose                      |
| -------- | -------------------------- | ---------------------------- |
| Overview | Two-pane: issues \| agents | Main dashboard, spawn agents |
| Agent    | Activity feed + sidebar    | Monitor agent, send messages |
| Help     | Keyboard shortcuts         | Reference                    |

### Reactive Primitives

Custom Solid.js hooks that bridge core services to reactive UI:

```typescript
// Tracks all agents with live state updates
const agents = createAgents();
// → Map<issueId, { adapter, state, model, ... }>

// Fetches issues with optional repo filter
const issues = createIssues({ repo: "owner/repo" });
// → Issue[]

// Chat state for an agent
const chat = createChat(issueId);
// → { messages, send, isLoading }

// Activity feed for an agent
const activity = createActivity(issueId);
// → ActivityItem[]

// Monitor status
const monitors = createMonitors(issueId);
// → Map<monitorId, MonitorStatus>

// Git changes in worktree
const changes = createFileChanges(worktreePath);
// → { staged: FileChange[], unstaged: FileChange[] }
```

**How reactivity works:**

```typescript
function createAgents() {
  const [version, setVersion] = createSignal(0);
  const bump = () => setVersion((v) => v + 1);

  // Subscribe to relevant hooks
  const { hooks, orchestrator } = useWorkhorseContext();
  hooks.on("agent.create.post", bump);
  hooks.on("agent.start.post", bump);
  hooks.on("agent.stop.post", bump);

  // Memo recomputes when version changes
  return createMemo(() => {
    version(); // Subscribe to version
    return orchestrator.getAll();
  });
}
```

### Activity Renderers

Plugin-extensible system for rendering notifications:

```typescript
interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}

type ActivityRenderer = (input: ActivityInput) => RenderedActivity | null;
```

**Plugin registration:**

```typescript
// Plugins register via hook
hooks.emit("tui.register_renderer", {
  id: "playwright",
  renderer: playwrightRenderer,
  priority: 50,
});

// Registry tries renderers in priority order
function renderActivity(input: ActivityInput): RenderedActivity {
  for (const renderer of sortedRenderers) {
    const result = renderer(input);
    if (result) return result;
  }
  return defaultRenderer(input);
}
```

**Built-in renderers:**

- `agent` — Agent lifecycle events (start, stop, idle)
- Plugins add their own (Pi tools, Playwright, etc.)

### Global UI State

Centralized state using Solid signals:

```typescript
const ui = {
  // Current state
  screen: Accessor<Screen>,
  modal: Accessor<Modal | null>,
  selectedAgentId: Accessor<string | null>,
  inputMode: Accessor<boolean>,
  focusedComponent: Accessor<"issues" | "agents" | "chat">,

  // Actions
  enterAgentView(agentId: string),  // Navigate to agent view to message
  openSpawnModal(issue: Issue),
  openModelSelector(),
  focusNext(),  // Tab navigation
  showError(message: string),
};
```

### Keyboard Bindings

Focus-aware shortcuts:

| Context                   | Key           | Action                               |
| ------------------------- | ------------- | ------------------------------------ |
| Global                    | `q`           | Quit                                 |
| Global                    | `?`           | Show help                            |
| Global                    | `Ctrl+X M`    | Model selector                       |
| Overview                  | `Tab`         | Cycle focus (issues → agents → chat) |
| Overview                  | `↑/↓`         | Navigate list                        |
| Overview                  | `Enter`       | Select/spawn                         |
| Overview (agents focused) | `s`           | Toggle agent (start/stop)            |
| Overview (agents focused) | `d/Backspace` | Remove stopped agent                 |
| Agent                     | `s`           | Toggle agent (start/stop)            |
| Agent                     | `d/Backspace` | Remove agent (if stopped)            |
| Agent                     | `Esc`         | Back to overview                     |
| Chat                      | `Enter`       | Send message                         |

## Startup Flow

```
1. parseCliArgs()
   └─▶ Handle --help, --list-models, --version

2. resolveConfigPaths()
   └─▶ Find ~/.workhorse.toml or create defaults

3. getPluginsNeedingSetup()
   └─▶ If any: show Setup wizard
       └─▶ Guide user through config creation

4. getPluginsNeedingAuth()
   └─▶ If any: show Auth screens
       └─▶ OAuth flows for Jira, GitHub, etc.

5. bootstrap({ plugins })
   └─▶ Initialize workhorse-core with all plugins

6. render(<App />)
   └─▶ Start terminal UI
```

## TUI as Plugin

The TUI registers itself as a plugin:

```typescript
const tuiPlugin = definePlugin({
  manifest: { name: "tui", version: "0.1.0" },

  setup() {
    const { hooks } = useWorkhorse();

    // Register built-in renderer
    registerRenderer("agent", agentRenderer);

    // Accept plugin renderers
    hooks.on("tui.register_renderer", (payload) => {
      registerRenderer(payload.id, payload.renderer, payload.priority);
    });
  },
});
```

## Components

### IssueList

Displays parsed issues with status indicators:

```
┌─ Issues ──────────────────────┐
│ ● PROJ-123  Implement login   │
│ ○ PROJ-124  Add dark mode     │
│ ◐ owner/repo#45  Fix crash    │
└───────────────────────────────┘
```

- `●` = Agent running
- `◐` = Agent starting/stopping
- `○` = No agent

### AgentList

Shows active agents with state:

```
┌─ Agents ──────────────────────┐
│ 🥧 PROJ-123  running  claude  │
│ 🤖 PROJ-124  stopped  gpt-4   │
└───────────────────────────────┘
```

### ActivityFeed

Live stream of agent activities:

```
┌─ Activity ────────────────────┐
│ 📝 Read src/auth.ts           │
│ ✏️  Edit src/auth.ts:15-20    │
│ 🔨 npm test                   │
│ ✅ All tests pass             │
│ 📸 Screenshot: login.png      │
└───────────────────────────────┘
```

### ChatBox

Send messages to agent:

```
┌─ Chat ────────────────────────┐
│ You: Please also handle the   │
│      error case               │
│                               │
│ Agent: I'll add error         │
│        handling...            │
├───────────────────────────────┤
│ > Type message...             │
└───────────────────────────────┘
```

### SpawnModal

Configure and spawn agent:

```
┌─ Spawn Agent ─────────────────┐
│ Issue: PROJ-123               │
│ Harness: [pi-coding-agent ▾]  │
│ Model: [claude-sonnet-4 ▾]    │
│                               │
│ [Cancel]  [Spawn]             │
└───────────────────────────────┘
```

## Dependencies on Core

| Import                | Usage               |
| --------------------- | ------------------- |
| `bootstrap`           | Initialize core     |
| `WorkhorseContext`    | Service access      |
| `HookEmitter`         | Event subscription  |
| `Tracker`             | Issue management    |
| `HarnessOrchestrator` | Agent lifecycle     |
| `MemoryService`       | Chat/notifications  |
| `MonitorService`      | Monitor status      |
| `AgentAdapter`        | Agent state/control |

## Why This Architecture

1. **Reactive primitives** — Clean separation between data fetching and rendering
2. **Hook-based updates** — UI stays in sync without polling
3. **Plugin renderers** — New tools can customize their activity display
4. **Focus management** — Vim-like navigation without mouse
5. **Setup-first flow** — Users don't hit auth errors mid-session
6. **Provider pattern** — Core services available throughout component tree
