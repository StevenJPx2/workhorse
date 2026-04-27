# Step 14: TUI

Terminal user interface for Jiratown. Real-time dashboard showing agent activity, notifications, and controls. Built with Ink (React for terminals).

**Location:** `packages/tui/` (standalone package: `@jiratown/tui`)

**External deps:** `ink`, `react`, `ink-select-input`, `ink-spinner`, `ink-text-input`, `ink-use-stdout-dimensions`

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
├── bin/
│   └── jiratown-tui.ts       # Entry point
└── src/
    ├── index.ts              # Main app, Ink render
    ├── app.tsx               # Root component
    ├── context/
    │   ├── jiratown.tsx      # JiratownContext provider for React
    │   └── keyboard.tsx      # Global keyboard handler context
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
    │   ├── agent-output.tsx  # Scrollable agent output
    │   ├── notification-list.tsx
    │   ├── notification-badge.tsx
    │   ├── status-bar.tsx    # Bottom status bar
    │   ├── command-palette.tsx # Ctrl+P command search
    │   ├── input-modal.tsx   # Modal for text input
    │   ├── confirm-modal.tsx # Modal for confirmations
    │   └── spinner.tsx       # Loading indicator
    ├── hooks/
    │   ├── use-agents.ts     # Subscribe to agent state
    │   ├── use-agent-output.ts # Stream agent output
    │   ├── use-notifications.ts # Subscribe to notifications
    │   ├── use-keyboard.ts   # Keyboard shortcuts
    │   └── use-focus.ts      # Focus management
    ├── store/
    │   ├── index.ts          # Zustand store
    │   ├── agents.ts         # Agent state slice
    │   └── ui.ts             # UI state slice (active screen, modals)
    └── __tests__/
        ├── dashboard.test.tsx
        ├── agent-list.test.tsx
        └── hooks.test.ts
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

### AgentList

```tsx
// components/agent-list.tsx
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { AgentAdapter } from "@jiratown/core";
import { useAgents } from "../hooks/use-agents.ts";
import { theme } from "../theme.ts";

interface AgentListProps {
  onSelect: (agent: AgentAdapter) => void;
}

export function AgentList({ onSelect }: AgentListProps) {
  const agents = useAgents();

  const items = agents.map((agent) => ({
    label: formatAgentLabel(agent),
    value: agent,
  }));

  return (
    <Box flexDirection="column">
      <Text bold>AGENTS</Text>
      <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
    </Box>
  );
}

function formatAgentLabel(agent: AgentAdapter): string {
  const status = theme.status[agent.state];
  const icon = agent.state === "running" ? "●" : "○";
  return `${icon} ${agent.issueId.padEnd(12)} ${status(agent.state)}`;
}
```

### AgentOutput

```tsx
// components/agent-output.tsx
import { Box, Text, useStdout } from "ink";
import { useAgentOutput } from "../hooks/use-agent-output.ts";

interface AgentOutputProps {
  issueId: string;
  maxLines?: number;
}

export function AgentOutput({ issueId, maxLines = 20 }: AgentOutputProps) {
  const output = useAgentOutput(issueId);
  const { stdout } = useStdout();
  const height = Math.min(maxLines, stdout?.rows ?? 20);

  const lines = output.split("\n").slice(-height);

  return (
    <Box flexDirection="column" height={height}>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  );
}
```

### StatusBar

```tsx
// components/status-bar.tsx
import { Box, Text } from "ink";
import { useNotifications } from "../hooks/use-notifications.ts";
import { useAgents } from "../hooks/use-agents.ts";

interface StatusBarProps {
  shortcuts: Array<{ key: string; label: string }>;
}

export function StatusBar({ shortcuts }: StatusBarProps) {
  const notifications = useNotifications();
  const agents = useAgents();

  const running = agents.filter((a) => a.state === "running").length;
  const pending = notifications.filter((n) => !n.acknowledged).length;

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false}>
      <Box flexGrow={1}>
        {shortcuts.map(({ key, label }) => (
          <Text key={key}>
            <Text bold>[{key}]</Text>
            <Text>{label}  </Text>
          </Text>
        ))}
      </Box>
      <Box>
        <Text color="green">● {running}</Text>
        <Text>  </Text>
        <Text color={pending > 0 ? "yellow" : "dim"}>🔔 {pending}</Text>
      </Box>
    </Box>
  );
}
```

### CommandPalette

```tsx
// components/command-palette.tsx
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { useState, useMemo } from "react";
import Fuse from "fuse.js";

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

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  const fuse = useMemo(
    () => new Fuse(commands, { keys: ["label", "id"] }),
    [commands]
  );

  const filtered = query
    ? fuse.search(query).map((r) => r.item)
    : commands;

  const items = filtered.map((cmd) => ({
    label: `${cmd.label}${cmd.shortcut ? ` (${cmd.shortcut})` : ""}`,
    value: cmd,
  }));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      padding={1}
      width={50}
    >
      <TextInput
        value={query}
        onChange={setQuery}
        placeholder="Search commands..."
      />
      <SelectInput
        items={items}
        onSelect={(item) => {
          item.value.action();
          onClose();
        }}
      />
    </Box>
  );
}
```

## Hooks

### useAgents

```typescript
// hooks/use-agents.ts
import { useState, useEffect } from "react";
import type { AgentAdapter } from "@jiratown/core";
import { useJiratown } from "../context/jiratown.tsx";

export function useAgents(): AgentAdapter[] {
  const { orchestrator, hooks } = useJiratown();
  const [agents, setAgents] = useState<AgentAdapter[]>(() =>
    orchestrator.getAll()
  );

  useEffect(() => {
    const refresh = () => setAgents(orchestrator.getAll());

    hooks.on("orchestrator.spawn.post", refresh);
    hooks.on("orchestrator.stop.post", refresh);

    return () => {
      hooks.off("orchestrator.spawn.post", refresh);
      hooks.off("orchestrator.stop.post", refresh);
    };
  }, [orchestrator, hooks]);

  return agents;
}
```

### useAgentOutput

```typescript
// hooks/use-agent-output.ts
import { useState, useEffect, useRef } from "react";
import { useJiratown } from "../context/jiratown.tsx";

export function useAgentOutput(issueId: string): string {
  const { hooks } = useJiratown();
  const [output, setOutput] = useState("");
  const bufferRef = useRef("");

  useEffect(() => {
    const handler = ({ issueId: id, delta }: { issueId: string; delta: string }) => {
      if (id === issueId) {
        bufferRef.current += delta;
        setOutput(bufferRef.current);
      }
    };

    hooks.on("agent.output", handler);
    return () => hooks.off("agent.output", handler);
  }, [issueId, hooks]);

  return output;
}
```

### useNotifications

```typescript
// hooks/use-notifications.ts
import { useState, useEffect } from "react";
import type { Notification } from "@jiratown/core";
import { useJiratown } from "../context/jiratown.tsx";

export function useNotifications(issueId?: string): Notification[] {
  const { memory, hooks } = useJiratown();
  const [notifications, setNotifications] = useState<Notification[]>(() =>
    memory.getNotifications(issueId)
  );

  useEffect(() => {
    const refresh = () => setNotifications(memory.getNotifications(issueId));

    hooks.on("notification.created", refresh);
    hooks.on("notification.acknowledged", refresh);

    return () => {
      hooks.off("notification.created", refresh);
      hooks.off("notification.acknowledged", refresh);
    };
  }, [memory, hooks, issueId]);

  return notifications;
}
```

### useKeyboard

```typescript
// hooks/use-keyboard.ts
import { useInput } from "ink";
import { useCallback } from "react";

interface KeyMap {
  [key: string]: () => void;
}

export function useKeyboard(keyMap: KeyMap) {
  useInput((input, key) => {
    // Handle special keys
    if (key.escape && keyMap["escape"]) {
      keyMap["escape"]();
      return;
    }
    if (key.return && keyMap["enter"]) {
      keyMap["enter"]();
      return;
    }
    if (key.ctrl && input === "p" && keyMap["ctrl+p"]) {
      keyMap["ctrl+p"]();
      return;
    }
    if (key.ctrl && input === "c" && keyMap["ctrl+c"]) {
      keyMap["ctrl+c"]();
      return;
    }

    // Handle regular keys
    if (keyMap[input]) {
      keyMap[input]();
    }
  });
}
```

## Store (Zustand)

```typescript
// store/index.ts
import { create } from "zustand";

type Screen = "dashboard" | "agent" | "notifications" | "config" | "help";
type Modal = "spawn" | "confirm-stop" | "command-palette" | null;

interface UIState {
  screen: Screen;
  modal: Modal;
  selectedIssueId: string | null;

  setScreen: (screen: Screen) => void;
  openModal: (modal: Modal) => void;
  closeModal: () => void;
  selectAgent: (issueId: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  screen: "dashboard",
  modal: null,
  selectedIssueId: null,

  setScreen: (screen) => set({ screen }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  selectAgent: (issueId) => set({ selectedIssueId: issueId }),
}));
```

## App Root

```tsx
// app.tsx
import { Box } from "ink";
import { JiratownProvider } from "./context/jiratown.tsx";
import { Dashboard } from "./screens/dashboard.tsx";
import { AgentView } from "./screens/agent.tsx";
import { Notifications } from "./screens/notifications.tsx";
import { SpawnModal } from "./screens/spawn.tsx";
import { CommandPalette } from "./components/command-palette.tsx";
import { useUIStore } from "./store/index.ts";
import { useKeyboard } from "./hooks/use-keyboard.ts";

export function App() {
  const { screen, modal, openModal, closeModal } = useUIStore();

  useKeyboard({
    "ctrl+p": () => openModal("command-palette"),
    "?": () => useUIStore.getState().setScreen("help"),
    "q": () => process.exit(0),
  });

  return (
    <JiratownProvider>
      <Box flexDirection="column" width="100%" height="100%">
        {screen === "dashboard" && <Dashboard />}
        {screen === "agent" && <AgentView />}
        {screen === "notifications" && <Notifications />}

        {modal === "spawn" && <SpawnModal onClose={closeModal} />}
        {modal === "command-palette" && (
          <CommandPalette commands={commands} onClose={closeModal} />
        )}
      </Box>
    </JiratownProvider>
  );
}
```

## Entry Point

```typescript
// bin/jiratown-tui.ts
#!/usr/bin/env bun
import { render } from "ink";
import { App } from "../src/app.tsx";

render(<App />);
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
    "ink": "^5.0.0",
    "react": "^18.3.0",
    "ink-select-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "ink-use-stdout-dimensions": "^1.0.5",
    "zustand": "^5.0.0",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/bun": "latest",
    "ink-testing-library": "^4.0.0"
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

```typescript
// theme.ts
import { type TextProps } from "ink";

export const theme = {
  status: {
    running: { color: "green" } as TextProps,
    stopped: { dimColor: true } as TextProps,
    crashed: { color: "red" } as TextProps,
    starting: { color: "yellow" } as TextProps,
    stopping: { color: "yellow" } as TextProps,
  },
  priority: {
    high: { color: "red", bold: true } as TextProps,
    normal: { color: "yellow" } as TextProps,
    low: { dimColor: true } as TextProps,
  },
  border: {
    style: "round" as const,
  },
};
```

## Tests

- **Dashboard**: renders agent list, updates on spawn/stop
- **AgentList**: navigation with j/k, selection with enter
- **AgentOutput**: streams output correctly, handles rapid updates
- **Notifications**: shows correct counts, acknowledges properly
- **CommandPalette**: fuzzy search works, executes commands
- **Keyboard**: shortcuts work globally and per-screen
- **Store**: state updates propagate to components

## Future Enhancements

- **Themes**: Dark/light mode, custom color schemes
- **Mouse support**: Click to select agents
- **Split views**: Multiple agents visible at once
- **Search**: Filter agents by name/status
- **Logs view**: Full session log browser
- **Performance graphs**: CPU/memory usage per agent
