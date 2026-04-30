# Step 15: TUI

Terminal user interface for Jiratown. Real-time dashboard showing agent activity, notifications, and controls. Built with OpenTUI + Solid.js for fine-grained reactivity and native performance.

**Location:** `packages/tui/` (standalone package: `@jiratown/tui`)

**External deps:** `solid-js`, `@opentui/solid`

## Design Goals

1. **Dashboard-first**: At a glance view of all agents
2. **Real-time**: Live streaming of agent output and notifications
3. **Keyboard-driven**: vim-style navigation, no mouse needed
4. **Non-blocking**: UI never freezes during async operations
5. **Composable**: Reusable components for CLI integration

## File Structure

```
packages/tui/
├── package.json
├── bunfig.toml               # Bun config with OpenTUI preload
├── tsconfig.json             # JSX config for @opentui/solid
├── bin/
│   └── jiratown-tui.ts       # Entry point
└── src/
    ├── index.tsx             # Main app, OpenTUI render
    ├── app.tsx               # Root component
    ├── context/
    │   └── jiratown.tsx      # JiratownContext provider for Solid
    ├── state/
    │   └── ui.ts             # UI state with Solid signals
    ├── screens/
    │   ├── dashboard.tsx     # Main dashboard (agent list + preview)
    │   ├── agent.tsx         # Single agent view (output + controls)
    │   ├── spawn.tsx         # Spawn new agent modal
    │   ├── notifications.tsx # Notification inbox
    │   ├── config.tsx        # Config editor
    │   └── help.tsx          # Keyboard shortcuts
    ├── components/
    │   ├── agent-list.tsx    # Selectable list of agents
    │   ├── agent-card.tsx    # Agent status card
    │   ├── agent-output.tsx  # Scrollable agent output (uses <scrollbox>)
    │   ├── notification-list.tsx
    │   ├── notification-badge.tsx
    │   ├── status-bar.tsx    # Bottom status bar
    │   ├── command-palette.tsx # Ctrl+P command search
    │   └── modal.tsx         # Reusable modal (uses Portal)
    ├── primitives/
    │   ├── create-agents.ts      # Reactive agent list
    │   ├── create-agent-output.ts # Stream agent output
    │   ├── create-notifications.ts # Reactive notifications
    │   └── create-keyboard.ts    # Keyboard handler
    ├── theme.ts              # Color constants
    └── __tests__/
        ├── dashboard.test.tsx
        ├── agent-list.test.tsx
        └── primitives.test.ts
```

## Screens

### Dashboard (default)

Main view showing all agents in a split layout.

```
┌─────────────────────────────────────────────────────────────────┐
│ Jiratown                                        [!] 3 ⚑ 2 🔔    │
├───────────────────────────────┬─────────────────────────────────┤
│ AGENTS                        │ AM-123 — Fix login bug          │
│                               │ ─────────────────────────────── │
│ ▸ AM-123    ● running  2h     │ Status: running                 │
│   PROJ-456  ○ stopped  1d     │ Harness: pi-coding-agent        │
│   repo#45   ● running  30m    │ Branch: fix/AM-123              │
│                               │                                 │
│                               │ Recent output:                  │
│                               │ > Analyzing the login flow...   │
│                               │ > Found issue in auth.ts:45     │
│                               │ > Creating fix...               │
│                               │                                 │
│                               │ Notifications (2):              │
│                               │ • [HIGH] Review changes req.    │
│                               │ • [NORM] Comment from @alice    │
├───────────────────────────────┴─────────────────────────────────┤
│ [n]ew  [s]top  [enter]focus  [?]help           j/k:nav  q:quit  │
└─────────────────────────────────────────────────────────────────┘
```

### Agent View

Full-screen view of a single agent's output with input.

```
┌─────────────────────────────────────────────────────────────────┐
│ AM-123 — Fix login bug                     ● running  [ESC]back │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ I'll start by analyzing the login flow in the codebase.        │
│                                                                 │
│ ▶ Reading src/auth/login.ts                                    │
│                                                                 │
│ Found the issue! The session token is not being refreshed      │
│ when the user's session expires. Let me fix this:              │
│                                                                 │
│ ▶ Editing src/auth/login.ts                                    │
│ ▶ Running tests...                                             │
│                                                                 │
│ ✓ All tests passing. Creating PR now.                          │
│                                                                 │
│ ▶ Calling github_open_pr                                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ > Focus on edge cases for token expiration█                    │
├─────────────────────────────────────────────────────────────────┤
│ [enter]send  [ctrl+c]stop  [n]notifications  [ESC]back         │
└─────────────────────────────────────────────────────────────────┘
```

### Spawn Modal

Modal for spawning a new agent.

```
┌───────────────────────────────────────┐
│ Spawn Agent                           │
├───────────────────────────────────────┤
│                                       │
│ Issue: AM-123█                        │
│                                       │
│ Harness: [pi-coding-agent ▾]          │
│ Base branch: main                     │
│ Repository: /Users/dev/project        │
│                                       │
│ [Enter] Spawn    [ESC] Cancel         │
└───────────────────────────────────────┘
```

### Notifications

Full notification inbox.

```
┌─────────────────────────────────────────────────────────────────┐
│ Notifications                                    [a]ck all      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ▸ [HIGH] Review requested changes on PR #45         AM-123     │
│   "Please add error handling for the edge case..."  2min ago   │
│                                                                 │
│   [NORM] New comment from @alice                    AM-123     │
│   "Looks good! One small suggestion..."             5min ago   │
│                                                                 │
│   [LOW]  CI check started                           repo#45    │
│   "Running test suite..."                           10min ago  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [enter]view  [a]ck  [d]ismiss  [ESC]back           j/k:nav     │
└─────────────────────────────────────────────────────────────────┘
```

## Components

OpenTUI uses lowercase intrinsic elements (`<box>`, `<text>`, `<select>`) with Solid's fine-grained reactivity.

### AgentList

```tsx
// components/agent-list.tsx
import { For } from "solid-js";
import { SelectRenderableEvents } from "@opentui/core";
import type { AgentAdapter } from "@jiratown/core";
import { createAgents } from "../primitives/create-agents.ts";
import { theme } from "../theme.ts";

interface AgentListProps {
  onSelect: (agent: AgentAdapter) => void;
}

export function AgentList(props: AgentListProps) {
  const agents = createAgents();

  const options = () =>
    agents().map((agent) => ({
      name: formatAgentLabel(agent),
      description: `${agent.state} · ${agent.harness}`,
      value: agent,
    }));

  let selectRef: any;

  // Handle selection via event
  const handleSelect = (_index: number, option: any) => {
    props.onSelect(option.value);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <text>
        <b>AGENTS</b>
      </text>
      <select
        ref={selectRef}
        options={options()}
        onItemSelected={handleSelect}
        selectedBackgroundColor={theme.colors.selection}
        selectedTextColor={theme.colors.text}
        showDescription
      />
    </box>
  );
}

function formatAgentLabel(agent: AgentAdapter): string {
  const icon = agent.state === "running" ? "●" : "○";
  return `${icon} ${agent.issueId.padEnd(12)} ${agent.state}`;
}
```

### AgentOutput

Uses `<scrollbox>` for scrollable output and `<markdown>` for rich agent responses:

```tsx
// components/agent-output.tsx
import { useTerminalDimensions } from "@opentui/solid";
import { createAgentOutput } from "../primitives/create-agent-output.ts";

interface AgentOutputProps {
  issueId: string;
  maxLines?: number;
}

export function AgentOutput(props: AgentOutputProps) {
  const output = createAgentOutput(() => props.issueId);
  const dimensions = useTerminalDimensions();

  const height = () => Math.min(props.maxLines ?? 20, dimensions().height - 10);

  return (
    <scrollbox height={height()} flexGrow={1}>
      <markdown content={output()} />
    </scrollbox>
  );
}
```

### StatusBar

```tsx
// components/status-bar.tsx
import { For } from "solid-js";
import { createAgents } from "../primitives/create-agents.ts";
import { createNotifications } from "../primitives/create-notifications.ts";
import { theme } from "../theme.ts";

interface Shortcut {
  key: string;
  label: string;
}

interface StatusBarProps {
  shortcuts: Shortcut[];
}

export function StatusBar(props: StatusBarProps) {
  const agents = createAgents();
  const notifications = createNotifications();

  const running = () => agents().filter((a) => a.state === "running").length;
  const pending = () => notifications().filter((n) => !n.acknowledged).length;

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="single"
      padding={1}
    >
      <box flexDirection="row" gap={2}>
        <For each={props.shortcuts}>
          {(shortcut) => (
            <text>
              <b>[{shortcut.key}]</b>
              <span>{shortcut.label}</span>
            </text>
          )}
        </For>
      </box>
      <box flexDirection="row" gap={2}>
        <text fg={theme.colors.success}>● {running()}</text>
        <text fg={pending() > 0 ? theme.colors.warning : theme.colors.dim}>
          🔔 {pending()}
        </text>
      </box>
    </box>
  );
}
```

### CommandPalette

Uses OpenTUI's built-in `<select>` with filtering:

```tsx
// components/command-palette.tsx
import { createSignal, createMemo, For } from "solid-js";
import { Portal, useRenderer } from "@opentui/solid";
import { theme } from "../theme.ts";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const renderer = useRenderer();
  const [query, setQuery] = createSignal("");

  // Simple filter (no external fuzzy lib needed for MVP)
  const filtered = createMemo(() => {
    const q = query().toLowerCase();
    if (!q) return props.commands;
    return props.commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q)
    );
  });

  const options = createMemo(() =>
    filtered().map((cmd) => ({
      name: `${cmd.label}${cmd.shortcut ? ` (${cmd.shortcut})` : ""}`,
      description: cmd.id,
      value: cmd,
    }))
  );

  const handleSelect = (_index: number, option: any) => {
    option.value.action();
    props.onClose();
  };

  return (
    <Portal mount={renderer.root}>
      <box
        flexDirection="column"
        borderStyle="rounded"
        title="Command Palette"
        padding={1}
        width={50}
        backgroundColor={theme.colors.background}
      >
        <input
          value={query()}
          onInput={(e) => setQuery(e.target.value)}
          placeholder="Search commands..."
        />
        <select
          options={options()}
          onItemSelected={handleSelect}
          height={10}
          showDescription={false}
        />
      </box>
    </Portal>
  );
}
```

### Modal (reusable)

```tsx
// components/modal.tsx
import { JSX } from "solid-js";
import { Portal, useRenderer } from "@opentui/solid";
import { theme } from "../theme.ts";

interface ModalProps {
  title: string;
  children: JSX.Element;
  width?: number;
}

export function Modal(props: ModalProps) {
  const renderer = useRenderer();

  return (
    <Portal mount={renderer.root}>
      <box
        flexDirection="column"
        borderStyle="rounded"
        title={props.title}
        padding={1}
        width={props.width ?? 40}
        backgroundColor={theme.colors.background}
      >
        {props.children}
      </box>
    </Portal>
  );
}
```

## Primitives (Solid Reactive Functions)

Solid uses the `create*` naming convention for reactive primitives instead of React's `use*` hooks.

### createAgents

```typescript
// primitives/create-agents.ts
import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { AgentAdapter } from "@jiratown/core";
import { useJiratown } from "../context/jiratown.tsx";

export function createAgents(): Accessor<AgentAdapter[]> {
  const { orchestrator, hooks } = useJiratown();
  const [agents, setAgents] = createSignal<AgentAdapter[]>(orchestrator.getAll());

  onMount(() => {
    const refresh = () => setAgents(orchestrator.getAll());

    hooks.on("orchestrator.spawn.post", refresh);
    hooks.on("orchestrator.stop.post", refresh);

    onCleanup(() => {
      hooks.off("orchestrator.spawn.post", refresh);
      hooks.off("orchestrator.stop.post", refresh);
    });
  });

  return agents;
}
```

### createAgentOutput

```typescript
// primitives/create-agent-output.ts
import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import { useJiratown } from "../context/jiratown.tsx";

export function createAgentOutput(issueId: Accessor<string>): Accessor<string> {
  const { hooks } = useJiratown();
  const [output, setOutput] = createSignal("");
  let buffer = "";

  onMount(() => {
    const handler = ({ issueId: id, delta }: { issueId: string; delta: string }) => {
      if (id === issueId()) {
        buffer += delta;
        setOutput(buffer);
      }
    };

    hooks.on("agent.output", handler);

    onCleanup(() => {
      hooks.off("agent.output", handler);
    });
  });

  return output;
}
```

### createNotifications

```typescript
// primitives/create-notifications.ts
import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { Notification } from "@jiratown/core";
import { useJiratown } from "../context/jiratown.tsx";

export function createNotifications(issueId?: Accessor<string | undefined>): Accessor<Notification[]> {
  const { memory, hooks } = useJiratown();
  const [notifications, setNotifications] = createSignal<Notification[]>(
    memory.getNotifications(issueId?.())
  );

  onMount(() => {
    const refresh = () => setNotifications(memory.getNotifications(issueId?.()));

    hooks.on("notification.created", refresh);
    hooks.on("notification.acknowledged", refresh);

    onCleanup(() => {
      hooks.off("notification.created", refresh);
      hooks.off("notification.acknowledged", refresh);
    });
  });

  return notifications;
}
```

### createKeyboardHandler

Uses OpenTUI's `useKeyboard` hook:

```typescript
// primitives/create-keyboard.ts
import { useKeyboard, useRenderer } from "@opentui/solid";

interface KeyMap {
  [key: string]: () => void;
}

export function createKeyboardHandler(keyMap: KeyMap) {
  const renderer = useRenderer();

  useKeyboard((event) => {
    // Build key string
    let keyStr = event.name;
    if (event.ctrl) keyStr = `ctrl+${keyStr}`;
    if (event.shift) keyStr = `shift+${keyStr}`;
    if (event.alt) keyStr = `alt+${keyStr}`;

    // Check keymap
    const handler = keyMap[keyStr] ?? keyMap[event.name];
    if (handler) {
      handler();
    }

    // Special: quit on 'q'
    if (event.name === "q" && keyMap["q"]) {
      renderer.destroy();
    }
  });
}

## UI State (Solid Signals)

Using Solid signals instead of Zustand — no external state library needed:

```typescript
// state/ui.ts
import { createSignal } from "solid-js";

export type Screen = "dashboard" | "agent" | "notifications" | "config" | "help";
export type Modal = "spawn" | "confirm-stop" | "command-palette" | null;

// Global UI state signals
const [screen, setScreen] = createSignal<Screen>("dashboard");
const [modal, setModal] = createSignal<Modal>(null);
const [selectedIssueId, setSelectedIssueId] = createSignal<string | null>(null);

export const ui = {
  // Accessors (read)
  screen,
  modal,
  selectedIssueId,

  // Actions (write)
  setScreen,
  openModal: (m: Modal) => setModal(m),
  closeModal: () => setModal(null),
  selectAgent: (issueId: string) => setSelectedIssueId(issueId),
};
```

## Context (Jiratown Provider)

```tsx
// context/jiratown.tsx
import { createContext, useContext, type JSX } from "solid-js";
import type { Orchestrator, Hooks, Memory } from "@jiratown/core";

interface JiratownContextValue {
  orchestrator: Orchestrator;
  hooks: Hooks;
  memory: Memory;
}

const JiratownContext = createContext<JiratownContextValue>();

export function useJiratown(): JiratownContextValue {
  const ctx = useContext(JiratownContext);
  if (!ctx) throw new Error("useJiratown must be used within JiratownProvider");
  return ctx;
}

interface JiratownProviderProps extends JiratownContextValue {
  children: JSX.Element;
}

export function JiratownProvider(props: JiratownProviderProps) {
  const value = {
    orchestrator: props.orchestrator,
    hooks: props.hooks,
    memory: props.memory,
  };

  return (
    <JiratownContext.Provider value={value}>
      {props.children}
    </JiratownContext.Provider>
  );
}
```

## App Root

```tsx
// app.tsx
import { Match, Switch } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { JiratownProvider } from "./context/jiratown.tsx";
import { Dashboard } from "./screens/dashboard.tsx";
import { AgentView } from "./screens/agent.tsx";
import { Notifications } from "./screens/notifications.tsx";
import { SpawnModal } from "./screens/spawn.tsx";
import { CommandPalette } from "./components/command-palette.tsx";
import { ui } from "./state/ui.ts";
import { createKeyboardHandler } from "./primitives/create-keyboard.ts";
import { commands } from "./commands.ts";
import type { Orchestrator, Hooks, Memory } from "@jiratown/core";

interface AppProps {
  orchestrator: Orchestrator;
  hooks: Hooks;
  memory: Memory;
}

export function App(props: AppProps) {
  const renderer = useRenderer();

  createKeyboardHandler({
    "ctrl+p": () => ui.openModal("command-palette"),
    "?": () => ui.setScreen("help"),
    q: () => renderer.destroy(),
    escape: () => {
      if (ui.modal()) {
        ui.closeModal();
      } else if (ui.screen() !== "dashboard") {
        ui.setScreen("dashboard");
      }
    },
  });

  return (
    <JiratownProvider
      orchestrator={props.orchestrator}
      hooks={props.hooks}
      memory={props.memory}
    >
      <box flexDirection="column" width="100%" height="100%">
        <Switch>
          <Match when={ui.screen() === "dashboard"}>
            <Dashboard />
          </Match>
          <Match when={ui.screen() === "agent"}>
            <AgentView />
          </Match>
          <Match when={ui.screen() === "notifications"}>
            <Notifications />
          </Match>
        </Switch>

        <Switch>
          <Match when={ui.modal() === "spawn"}>
            <SpawnModal onClose={ui.closeModal} />
          </Match>
          <Match when={ui.modal() === "command-palette"}>
            <CommandPalette commands={commands} onClose={ui.closeModal} />
          </Match>
        </Switch>
      </box>
    </JiratownProvider>
  );
}
```

## Entry Point

```typescript
// bin/jiratown-tui.ts
#!/usr/bin/env bun
import { render } from "@opentui/solid";
import { initJiratown } from "@jiratown/core";
import { App } from "../src/app.tsx";

// Initialize Jiratown core
const jiratown = await initJiratown();

// Render TUI with OpenTUI
render(() => (
  <App
    orchestrator={jiratown.orchestrator}
    hooks={jiratown.hooks}
    memory={jiratown.memory}
  />
));
```

## Configuration Files

### bunfig.toml

```toml
preload = ["@opentui/solid/preload"]
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid"
  },
  "include": ["src/**/*", "bin/**/*"]
}
```

## package.json

```json
{
  "name": "@jiratown/tui",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "jiratown-tui": "./bin/jiratown-tui.ts"
  },
  "dependencies": {
    "@jiratown/core": "workspace:*",
    "@jiratown/plugin-pi-adapter": "workspace:*",
    "@jiratown/plugin-jira": "workspace:*",
    "@jiratown/plugin-github": "workspace:*",
    "solid-js": "^1.9.0",
    "@opentui/solid": "^0.1.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

## Keyboard Shortcuts

### Global
| Key | Action |
|-----|--------|
| `q` | Quit |
| `?` | Help screen |
| `Ctrl+P` | Command palette |
| `ESC` | Back / Close modal |

### Dashboard
| Key | Action |
|-----|--------|
| `j/k` or `↑/↓` | Navigate agent list |
| `Enter` | Focus selected agent |
| `n` | Spawn new agent |
| `s` | Stop selected agent |
| `N` | Open notifications |

### Agent View
| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Ctrl+C` | Stop agent |
| `n` | View notifications |
| `ESC` | Back to dashboard |

### Notifications
| Key | Action |
|-----|--------|
| `j/k` | Navigate |
| `Enter` | View notification detail |
| `a` | Acknowledge |
| `A` | Acknowledge all |
| `d` | Dismiss |

## Theme

OpenTUI uses hex colors and RGBA values:

```typescript
// theme.ts
export const theme = {
  colors: {
    // Base
    background: "#1a1a2e",
    surface: "#16213e",
    text: "#eaeaea",
    dim: "#666666",

    // Semantic
    success: "#4ade80",
    warning: "#facc15",
    error: "#f87171",
    info: "#60a5fa",

    // UI
    selection: "#334155",
    border: "#475569",
  },

  status: {
    running: "#4ade80",   // green
    stopped: "#666666",   // dim
    crashed: "#f87171",   // red
    starting: "#facc15",  // yellow
    stopping: "#facc15",  // yellow
  },

  priority: {
    high: "#f87171",
    normal: "#facc15",
    low: "#666666",
  },

  border: {
    style: "rounded" as const,
  },
};
```

## OpenTUI-Specific Features

OpenTUI provides built-in components perfect for agent output:

### Markdown Rendering

```tsx
// Agent responses are rendered with full markdown support
<markdown content={agentOutput()} />
```

### Syntax-Highlighted Code

```tsx
// Code blocks with tree-sitter highlighting
<code language="typescript" content={codeSnippet} />
```

### Diff Viewer

```tsx
// Show file changes made by agents
<diff
  before={originalCode}
  after={modifiedCode}
  mode="unified"
/>
```

### Scrollable Output

```tsx
// Scrollable container for long agent output
<scrollbox height={20}>
  <markdown content={output()} />
</scrollbox>
```

## Tests

Using OpenTUI's `testRender` for snapshot and interaction tests:

```typescript
// __tests__/dashboard.test.tsx
import { describe, it, expect } from "vitest";
import { testRender } from "@opentui/solid";
import { Dashboard } from "../screens/dashboard.tsx";

describe("Dashboard", () => {
  it("renders agent list", async () => {
    const { snapshot } = await testRender(() => <Dashboard />, {
      width: 80,
      height: 24,
    });

    expect(snapshot()).toContain("AGENTS");
  });

  it("updates on agent spawn", async () => {
    const { snapshot, rerender } = await testRender(() => <Dashboard />);

    // Simulate spawn event
    mockHooks.emit("orchestrator.spawn.post", { issueId: "AM-123" });

    // Snapshot should update
    expect(snapshot()).toContain("AM-123");
  });
});
```

```typescript
// __tests__/agent-list.test.tsx
import { describe, it, expect } from "vitest";
import { testRender } from "@opentui/solid";
import { AgentList } from "../components/agent-list.tsx";

describe("AgentList", () => {
  it("navigates with j/k", async () => {
    const onSelect = vi.fn();
    const { pressKey, snapshot } = await testRender(
      () => <AgentList onSelect={onSelect} />,
      { width: 40, height: 10 }
    );

    await pressKey("j"); // Move down
    await pressKey("enter"); // Select

    expect(onSelect).toHaveBeenCalled();
  });
});
```

```typescript
// __tests__/primitives.test.ts
import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { createAgents } from "../primitives/create-agents.ts";

describe("createAgents", () => {
  it("returns reactive agent list", () => {
    createRoot((dispose) => {
      const agents = createAgents();
      expect(agents()).toEqual([]);

      // Simulate spawn
      mockOrchestrator.spawn({ issueId: "AM-123" });
      mockHooks.emit("orchestrator.spawn.post");

      expect(agents()).toHaveLength(1);
      dispose();
    });
  });
});
```

## Future Enhancements

- **Themes**: Dark/light mode, custom color schemes via theme.ts
- **Mouse support**: OpenTUI supports mouse events on boxes
- **Split views**: Multiple agents visible using flexbox layout
- **Search**: Filter agents using `<input>` + derived signals
- **Logs view**: Full session log browser using `<scrollbox>`
- **Performance graphs**: Could use `<ascii_font>` for sparklines
- **Animations**: OpenTUI supports `useTimeline` for transitions
