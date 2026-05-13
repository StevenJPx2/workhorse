# Step 14: TUI

Terminal user interface for Workhorse. Simple overview with a chat box, issue backlog, and running agents. Built with OpenTUI + Solid.js for fine-grained reactivity and native performance.

**Location:** `packages/tui/` (package: `@fdcn/workhorse`)

**External deps:** `solid-js`, `@opentui/solid`

**Testing:** Uses [ht (headless terminal)](https://github.com/andyk/ht) for programmatic testing

## Package Structure

The TUI is a **standalone application** that also **provides a plugin**:

```
packages/tui/                    # Standalone TUI application
├── src/
│   ├── index.ts                 # Main entry - calls bootstrap(), starts TUI
│   ├── plugin.ts                # Plugin definition for hook registration
│   ├── tui.tsx                  # TUI renderer
│   └── ...
└── package.json                 # @fdcn/workhorse
```

**Why this structure:**
- TUI is the main entry point that bootstraps Workhorse
- It registers its own plugin so other plugins (Jira, GitHub) can register notification renderers
- The plugin is loaded alongside other plugins during bootstrap

## Design Goals

1. **Simple overview**: Chat box front and center, issues and agents below
2. **Click to dive in**: Click an agent to enter the agent dashboard
3. **Keyboard-driven**: vim-style navigation, clickable for mouse users
4. **Real-time**: Live streaming of agent output
5. **Notifications in chat**: All external events appear in the chat stream
6. **Blocking is visible**: When agent is stuck, it's immediately obvious (⚠ blocked)

## Notification Flow

**All external events flow into the chat stream:**

| Source | Event | Icon | Agent Behavior |
|--------|-------|------|----------------|
| GitHub | PR comment | 💬 | Auto-respond if actionable |
| GitHub | Changes requested | 🔴 | Address feedback, push fixes |
| GitHub | PR approved | ✅ | Merge if ready |
| GitHub | CI failed | ❌ | Analyze and fix |
| Jira | Comment added | 🎫 | Incorporate new context |
| Jira | Status changed | 🎫 | React accordingly |
| Jira | Assignee changed | 🎫 | Note the change |

**Blocking behavior (agent can't proceed alone):**
- Agent stops and waits for user input
- Status shows `⚠ BLOCKED` in sidebar and header  
- Blocked message is highlighted in chat
- User responds in chat to unblock
- Agent resumes work after receiving guidance

**Examples of blocking situations:**
- Unclear PR feedback that needs clarification
- Jira ticket moved to "Blocked" status
- Missing permissions or access
- Ambiguous requirements
- Conflicts with other work

## Architecture: TUI with Plugin

The TUI is a standalone application that also registers a plugin (`tui`). This allows:
- Other plugins (Jira, GitHub) to register notification renderers
- Clean separation between core TUI and source-specific rendering
- Easy extensibility for new notification sources

### Plugin Registration

```typescript
// src/plugin.ts - TUI plugin definition
import { definePlugin, useWorkhorse } from "workhorse-core";
import { registerRenderer } from "./renderers";

export default definePlugin({
  manifest: {
    name: "tui",
    version: "0.1.0",
  },
  setup() {
    const { hooks } = useWorkhorse();
    
    // Register hook for other plugins to add notification renderers
    hooks.on("tui.register_renderer", ({ type, renderer }) => {
      registerRenderer(type, renderer);
    });
    
    // TUI startup happens in index.ts after bootstrap, not here
  },
});
```

```typescript
// src/index.ts - Main entry point
import { bootstrap } from "workhorse-core";
import { render } from "@opentui/solid";
import { App } from "./app.tsx";
import tuiPlugin from "./plugin.ts";
import jiraPlugin from "workhorse-plugin-jira";
import githubPlugin from "workhorse-plugin-github";
import piAdapterPlugin from "workhorse-plugin-pi-adapter";

export async function startTUI() {
  // Bootstrap Workhorse with all plugins
  const workhorse = await bootstrap({
    plugins: [
      tuiPlugin,        // TUI plugin (renderer hooks)
      jiraPlugin,       // Jira integration
      githubPlugin,     // GitHub integration
      piAdapterPlugin,  // Default agent harness
    ],
  });

  // Now render the TUI (after all plugins have registered renderers)
  render(() => (
    <App
      orchestrator={workhorse.orchestrator}
      hooks={workhorse.hooks}
      memory={workhorse.memory}
      tracker={workhorse.tracker}
      config={workhorse.config}
    />
  ));

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await workhorse.shutdown();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.main) {
  startTUI();
}
```

### Notification Renderer Hook

Plugins like `workhorse-plugin-jira` and `workhorse-plugin-github` can register custom renderers:

```typescript
// In workhorse-plugin-jira setup
hooks.emit("tui.register_renderer", {
  type: "jira_comment",
  renderer: (notification) => ({
    icon: "🎫",
    title: `Jira Comment from @${notification.author} on ${notification.issueKey}`,
    body: notification.body,
    style: "box", // "box" | "inline"
  }),
});

hooks.emit("tui.register_renderer", {
  type: "jira_status_change",
  renderer: (notification) => ({
    icon: "🎫",
    title: `${notification.issueKey} status changed`,
    subtitle: `${notification.fromStatus} → ${notification.toStatus}`,
    body: `by @${notification.author}`,
    style: "box",
  }),
});
```

```typescript
// In workhorse-plugin-github setup
hooks.emit("tui.register_renderer", {
  type: "pr_comment",
  renderer: (notification) => ({
    icon: "💬",
    title: `PR Comment from @${notification.author} on PR #${notification.prNumber}`,
    subtitle: notification.file ? `${notification.file}:${notification.line}` : undefined,
    body: notification.body,
    style: "box",
  }),
});

hooks.emit("tui.register_renderer", {
  type: "pr_changes_requested",
  renderer: (notification) => ({
    icon: "🔴",
    title: `Changes Requested by @${notification.author} on PR #${notification.prNumber}`,
    body: notification.comments.map((c) => `${c.file}:${c.line}\n"${c.body}"`).join("\n\n"),
    style: "box",
  }),
});

hooks.emit("tui.register_renderer", {
  type: "pr_approved",
  renderer: (notification) => ({
    icon: "✅",
    title: `PR #${notification.prNumber} approved by @${notification.author}`,
    style: "inline",
  }),
});

hooks.emit("tui.register_renderer", {
  type: "ci_failed",
  renderer: (notification) => ({
    icon: "❌",
    title: `CI Failed on PR #${notification.prNumber}`,
    body: notification.summary,
    style: "box",
  }),
});
```

### Default Renderer

The TUI provides a fallback renderer for unknown notification types:

```typescript
const defaultRenderer = (notification) => ({
  icon: "📩",
  title: notification.title,
  body: notification.body,
  style: "box",
});
```

## File Structure

```
packages/tui/                   # Standalone application + plugin
├── package.json
├── bunfig.toml                 # Bun config with OpenTUI preload
├── tsconfig.json               # JSX config for @opentui/solid
└── src/
    ├── index.ts                # Main entry - bootstrap + render
    ├── plugin.ts               # TUI plugin definition
    ├── app.tsx                 # Root component
    ├── context/
    │   └── workhorse.tsx        # WorkhorseContext provider for Solid
    ├── state/
    │   └── ui.ts               # UI state with Solid signals
    ├── renderers/
    │   ├── index.ts            # Renderer registry
    │   ├── types.ts            # Renderer types
    │   └── default.ts          # Default fallback renderer
    ├── screens/
    │   ├── overview.tsx        # Main overview (chat + issues/agents lists)
    │   ├── agent.tsx           # Agent dashboard (sidebar + chat)
    │   └── help.tsx          # Keyboard shortcuts
    ├── components/
    │   ├── chat-box.tsx      # Chat input/output
    │   ├── chat-message.tsx  # Single message (uses renderers)
    │   ├── notification-box.tsx  # Rendered notification in chat
    │   ├── issue-list.tsx    # Unassigned issues
    │   ├── agent-list.tsx    # Running agents
    │   ├── agent-sidebar.tsx # Agent list sidebar (for agent screen)
    │   ├── spawn-modal.tsx   # Modal for spawning agents
    │   └── status-bar.tsx    # Bottom status bar
    ├── primitives/
    │   ├── create-issues.ts      # Reactive issue backlog
    │   ├── create-agents.ts      # Reactive agent list
    │   ├── create-chat.ts        # Chat state for selected context
    │   └── create-keyboard.ts    # Keyboard handler
    ├── theme.ts              # Color constants
    └── __tests__/
        ├── overview.test.tsx
        ├── agent.test.tsx
        └── primitives.test.ts
```

## Screens

### Overview (default)

Simple layout: large chat box on top, issues and agents side-by-side below.

```
┌─────────────────────────────────────────────────────────────────┐
│ Workhorse                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Welcome! Select an issue to spawn an agent, or click on a     │
│  running agent to view its progress.                           │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ > Ask a question or type a command...█                         │
├─────────────────────────────────────────────────────────────────┤
│ ISSUES                          │ AGENTS                        │
│ ▸ AM-123 Fix login bug          │ ▸ AM-456 ● 2h  ⚠ blocked      │
│   AM-124 Add OAuth support      │   PROJ-789 ● 30m              │
│   AM-125 Fix logout redirect    │                               │
│   #142 Refactor API layer       │                               │
│   #143 Add integration tests    │                               │
├─────────────────────────────────┴───────────────────────────────┤
│ [Enter]select  [?]help                                   q:quit │
└─────────────────────────────────────────────────────────────────┘
```

**Layout:**
- **Top**: Large chat/output area
- **Middle**: Chat input box
- **Bottom left**: Unassigned issues (click to spawn agent via modal)
- **Bottom right**: Running agents with status (⚠ blocked = needs user input)
- **Footer**: Keyboard shortcuts

**Agent Status Indicators:**
- `●` = running normally
- `⚠ blocked` = agent is stuck, needs user intervention (click to see why)

### Agent Dashboard

When you click an agent, you enter this view with sidebar + full chat.

```
┌─────────────────────────────────────────────────────────────────┐
│ AM-456 — Fix login bug                         ● running        │
├───────────────┬─────────────────────────────────────────────────┤
│ AGENTS        │                                                 │
│               │ I'll start by analyzing the login flow.        │
│ ▸ AM-456 ● 2h │                                                 │
│   ⚠ blocked   │ ▶ Reading src/auth/login.ts                    │
│               │                                                 │
│   PROJ-789    │ Found the issue! The session token is not      │
│   ● 30m       │ being refreshed when the session expires.      │
│               │                                                 │
│               │ ▶ Editing src/auth/login.ts                    │
│               │ ▶ Running tests...                             │
│               │                                                 │
│               │ ✓ All tests passing. Creating PR now.          │
│               │                                                 │
│               │ ▶ Created PR #47                                │
│               │                                                 │
│               ├─────────────────────────────────────────────────┤
│               │ > █                                             │
├───────────────┴─────────────────────────────────────────────────┤
│ [Enter]send  [s]top  [ESC]back                          q:quit  │
└─────────────────────────────────────────────────────────────────┘
```

**Layout:**
- **Left sidebar**: All running agents (click to switch)
- **Right**: Full chat history + input for selected agent
- **Footer**: Keyboard shortcuts

### PR Review/Comment in Chat Stream

When a PR review or comment comes in, it appears as a message in the chat:

```
┌─────────────────────────────────────────────────────────────────┐
│ AM-456 — Fix login bug                         ● running        │
├───────────────┬─────────────────────────────────────────────────┤
│ AGENTS        │                                                 │
│               │ ✓ All tests passing. Creating PR now.          │
│ ▸ AM-456 ● 2h │                                                 │
│               │ ▶ Created PR #47                                │
│   PROJ-789    │                                                 │
│   ● 30m       │ ┌─────────────────────────────────────────────┐ │
│               │ │ 💬 PR Comment from @alice on PR #47         │ │
│               │ │ src/auth/login.ts:45                        │ │
│               │ │                                             │ │
│               │ │ "Nice fix! Could you also add a unit test   │ │
│               │ │  for the token refresh edge case?"          │ │
│               │ └─────────────────────────────────────────────┘ │
│               │                                                 │
│               │ Sure! I'll add a unit test for the token        │
│               │ refresh edge case.                              │
│               │                                                 │
│               │ ▶ Writing tests/auth/login.test.ts              │
│               │                                                 │
│               ├─────────────────────────────────────────────────┤
│               │ > █                                             │
├───────────────┴─────────────────────────────────────────────────┤
│ [Enter]send  [s]top  [ESC]back                          q:quit  │
└─────────────────────────────────────────────────────────────────┘
```

The agent automatically handles PR comments and continues working.

### Blocking Notification (Agent Stuck)

When the agent encounters something it can't handle alone (e.g., "Changes Requested" 
with unclear feedback, permission issues, or needs clarification), it becomes blocked:

```
┌─────────────────────────────────────────────────────────────────┐
│ AM-456 — Fix login bug                         ⚠ BLOCKED        │
├───────────────┬─────────────────────────────────────────────────┤
│ AGENTS        │                                                 │
│               │ ▶ Created PR #47                                │
│ ▸ AM-456 ● 2h │                                                 │
│   ⚠ blocked   │ ┌─────────────────────────────────────────────┐ │
│               │ │ 💬 PR Comment from @alice on PR #47         │ │
│   PROJ-789    │ │                                             │ │
│   ● 30m       │ │ "This approach won't work with our SSO      │ │
│               │ │  setup. We need to use the OAuth flow       │ │
│               │ │  instead. Check with the platform team."    │ │
│               │ └─────────────────────────────────────────────┘ │
│               │                                                 │
│               │ ┌─────────────────────────────────────────────┐ │
│               │ │ ⚠ BLOCKED — Need your help                  │ │
│               │ │                                             │ │
│               │ │ I don't have enough context about the SSO   │ │
│               │ │ setup or OAuth flow requirements. Could you │ │
│               │ │ provide more details or point me to the     │ │
│               │ │ relevant documentation?                     │ │
│               │ └─────────────────────────────────────────────┘ │
│               │                                                 │
│               ├─────────────────────────────────────────────────┤
│               │ > Check confluence page AUTH-DOCS for SSO...█  │
├───────────────┴─────────────────────────────────────────────────┤
│ [Enter]send  [s]top  [ESC]back                          q:quit  │
└─────────────────────────────────────────────────────────────────┘
```

**Blocking states:**
- Agent stops working and waits for user input
- Status changes to `⚠ BLOCKED` in header and sidebar
- Blocked message is highlighted/boxed in the chat stream
- User can respond in the chat to unblock the agent

### PR Review: Changes Requested

```
┌─────────────────────────────────────────────────────────────────┐
│ AM-456 — Fix login bug                         ● running        │
├───────────────┬─────────────────────────────────────────────────┤
│ AGENTS        │                                                 │
│               │ ┌─────────────────────────────────────────────┐ │
│ ▸ AM-456 ● 2h │ │ 🔴 Changes Requested by @bob on PR #47     │ │
│               │ │                                             │ │
│   PROJ-789    │ │ 1. src/auth/login.ts:45                     │ │
│   ● 30m       │ │    "Add error handling for network timeout" │ │
│               │ │                                             │ │
│               │ │ 2. src/auth/login.ts:52                     │ │
│               │ │    "Use the AUTH_TIMEOUT constant instead"  │ │
│               │ └─────────────────────────────────────────────┘ │
│               │                                                 │
│               │ I'll address both review comments now.          │
│               │                                                 │
│               │ ▶ Editing src/auth/login.ts                    │
│               │   - Adding error handling for network timeout   │
│               │   - Using AUTH_TIMEOUT constant                 │
│               │                                                 │
│               │ ▶ Running tests...                             │
│               │                                                 │
│               ├─────────────────────────────────────────────────┤
│               │ > █                                             │
├───────────────┴─────────────────────────────────────────────────┤
│ [Enter]send  [s]top  [ESC]back                          q:quit  │
└─────────────────────────────────────────────────────────────────┘
```

When the agent can understand and address the feedback, it automatically continues.

### Jira Comment

When someone comments on the Jira ticket:

```
┌─────────────────────────────────────────────────────────────────┐
│ AM-456 — Fix login bug                         ● running        │
├───────────────┬─────────────────────────────────────────────────┤
│ AGENTS        │                                                 │
│               │ ▶ Analyzing the codebase...                     │
│ ▸ AM-456 ● 2h │                                                 │
│               │ ┌─────────────────────────────────────────────┐ │
│   PROJ-789    │ │ 🎫 Jira Comment from @carol on AM-456       │ │
│   ● 30m       │ │                                             │ │
│               │ │ "Hey, just FYI - this bug only happens      │ │
│               │ │  when the user has 2FA enabled. The normal  │ │
│               │ │  login flow works fine."                    │ │
│               │ └─────────────────────────────────────────────┘ │
│               │                                                 │
│               │ Thanks for the context! I'll focus on the 2FA   │
│               │ authentication path specifically.               │
│               │                                                 │
│               │ ▶ Reading src/auth/two-factor.ts                │
│               │                                                 │
│               ├─────────────────────────────────────────────────┤
│               │ > █                                             │
├───────────────┴─────────────────────────────────────────────────┤
│ [Enter]send  [s]top  [ESC]back                          q:quit  │
└─────────────────────────────────────────────────────────────────┘
```

### Jira Status Change

When the ticket status changes (e.g., moved to "In Review", "Blocked", etc.):

```
│               │ ┌─────────────────────────────────────────────┐ │
│               │ │ 🎫 AM-456 status changed                    │ │
│               │ │ In Progress → Blocked                       │ │
│               │ │ by @dave                                    │ │
│               │ └─────────────────────────────────────────────┘ │
│               │                                                 │
│               │ ┌─────────────────────────────────────────────┐ │
│               │ │ ⚠ BLOCKED — Need your help                  │ │
│               │ │                                             │ │
│               │ │ The ticket was moved to Blocked. I'll wait  │ │
│               │ │ for guidance on how to proceed.             │ │
│               │ └─────────────────────────────────────────────┘ │
```

### Spawn Modal

Modal shown when clicking an unassigned issue.

```
┌───────────────────────────────────────┐
│ Spawn Agent                           │
├───────────────────────────────────────┤
│                                       │
│ Issue: AM-123 — Fix login bug         │
│                                       │
│ Harness: [pi-coding-agent ▾]          │
│ Base branch: main                     │
│                                       │
│ [Enter] Spawn    [ESC] Cancel         │
└───────────────────────────────────────┘
```

## Components

OpenTUI uses lowercase intrinsic elements (`<box>`, `<text>`, `<select>`) with Solid's fine-grained reactivity.

### ChatBox

Large chat area with scrollable output and input:

```tsx
// components/chat-box.tsx
import { createSignal, Show, For } from "solid-js";
import { theme } from "../theme.ts";

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
}

interface ChatBoxProps {
  messages: () => ChatMessage[];
  onSend: (message: string) => void;
  placeholder?: string;
}

export function ChatBox(props: ChatBoxProps) {
  const [input, setInput] = createSignal("");

  const handleSubmit = () => {
    const msg = input().trim();
    if (msg) {
      props.onSend(msg);
      setInput("");
    }
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Chat messages */}
      <scrollbox flexGrow={1} borderStyle="single">
        <For each={props.messages()}>
          {(msg) => (
            <box flexDirection="column" marginBottom={1}>
              <text fg={msg.role === "user" ? theme.colors.info : theme.colors.text}>
                {msg.role === "user" ? "> " : ""}{msg.content}
              </text>
            </box>
          )}
        </For>
      </scrollbox>

      {/* Input */}
      <box borderStyle="single" padding={1}>
        <input
          value={input()}
          onInput={(e) => setInput(e.target.value)}
          onSubmit={handleSubmit}
          placeholder={props.placeholder ?? "Type a message..."}
        />
      </box>
    </box>
  );
}
```

### Renderer Types

Types for the notification renderer system:

```typescript
// renderers/types.ts
import type { Notification } from "workhorse-core";

export interface RenderedNotification {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
}

export type NotificationRenderer = (notification: Notification) => RenderedNotification;

// Registry of renderers by notification type
export const renderers = new Map<string, NotificationRenderer>();

export function registerRenderer(type: string, renderer: NotificationRenderer) {
  renderers.set(type, renderer);
}

export function getRenderer(type: string): NotificationRenderer {
  return renderers.get(type) ?? defaultRenderer;
}

// Default fallback renderer
const defaultRenderer: NotificationRenderer = (notification) => ({
  icon: "📩",
  title: notification.title,
  body: notification.body,
  style: "box",
});
```

### NotificationBox

Renders a notification in the chat using plugin-registered renderers:

```tsx
// components/notification-box.tsx
import { Show } from "solid-js";
import { getRenderer } from "../renderers/types.ts";
import { theme } from "../theme.ts";
import type { Notification } from "workhorse-core";

interface NotificationBoxProps {
  notification: Notification;
}

export function NotificationBox(props: NotificationBoxProps) {
  const rendered = () => getRenderer(props.notification.type)(props.notification);

  return (
    <Show
      when={rendered().style === "box"}
      fallback={
        // Inline style
        <text>
          {rendered().icon} {rendered().title}
        </text>
      }
    >
      {/* Box style */}
      <box
        flexDirection="column"
        borderStyle="rounded"
        padding={1}
        marginBottom={1}
      >
        <text>
          {rendered().icon} <b>{rendered().title}</b>
        </text>
        <Show when={rendered().subtitle}>
          <text fg={theme.colors.dim}>{rendered().subtitle}</text>
        </Show>
        <Show when={rendered().body}>
          <text>{rendered().body}</text>
        </Show>
      </box>
    </Show>
  );
}
```

### BlockedBox

Special styled box for when agent is blocked:

```tsx
// components/blocked-box.tsx
import { theme } from "../theme.ts";

interface BlockedBoxProps {
  message: string;
}

export function BlockedBox(props: BlockedBoxProps) {
  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={theme.colors.warning}
      padding={1}
      marginBottom={1}
    >
      <text fg={theme.colors.warning}>
        <b>⚠ BLOCKED — Need your help</b>
      </text>
      <text>{props.message}</text>
    </box>
  );
}
```

### IssueList

Unassigned issues that can be picked up:

```tsx
// components/issue-list.tsx
import { For } from "solid-js";
import { createIssues } from "../primitives/create-issues.ts";
import { theme } from "../theme.ts";
import type { ParsedIssue } from "workhorse-core";

interface IssueListProps {
  onSelect: (issue: ParsedIssue) => void;
}

export function IssueList(props: IssueListProps) {
  const issues = createIssues();

  const options = () =>
    issues().map((issue) => ({
      name: `${issue.key} ${issue.title.slice(0, 25)}`,
      value: issue,
    }));

  const handleSelect = (_index: number, option: any) => {
    props.onSelect(option.value);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <text>
        <b>ISSUES</b>
      </text>
      <select
        options={options()}
        onItemSelected={handleSelect}
        selectedBackgroundColor={theme.colors.selection}
      />
    </box>
  );
}
```

### AgentList

Running agents (click to enter agent dashboard):

```tsx
// components/agent-list.tsx
import { For } from "solid-js";
import type { AgentAdapter } from "workhorse-core";
import { createAgents } from "../primitives/create-agents.ts";
import { theme } from "../theme.ts";

interface AgentListProps {
  onSelect: (agent: AgentAdapter) => void;
  selectedId?: () => string | null;
}

export function AgentList(props: AgentListProps) {
  const agents = createAgents();

  const options = () =>
    agents().map((agent) => ({
      name: formatAgentLabel(agent),
      value: agent,
    }));

  const handleSelect = (_index: number, option: any) => {
    props.onSelect(option.value);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <text>
        <b>AGENTS</b>
      </text>
      <select
        options={options()}
        onItemSelected={handleSelect}
        selectedBackgroundColor={theme.colors.selection}
      />
    </box>
  );
}

function formatAgentLabel(agent: AgentAdapter): string {
  const icon = agent.state === "running" ? "●" : "○";
  const duration = formatDuration(agent.startedAt);
  const blocked = agent.hasBlockingNotification ? " ⚠ blocked" : "";
  return `${agent.issueId} ${icon} ${duration}${blocked}`;
}

function formatDuration(startedAt: Date): string {
  const mins = Math.floor((Date.now() - startedAt.getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}
```

### AgentSidebar

Sidebar for agent dashboard showing all agents:

```tsx
// components/agent-sidebar.tsx
import { For } from "solid-js";
import type { AgentAdapter } from "workhorse-core";
import { createAgents } from "../primitives/create-agents.ts";
import { theme } from "../theme.ts";

interface AgentSidebarProps {
  selectedId: () => string;
  onSelect: (agent: AgentAdapter) => void;
}

export function AgentSidebar(props: AgentSidebarProps) {
  const agents = createAgents();

  return (
    <box flexDirection="column" width={15} borderStyle="single">
      <text>
        <b>AGENTS</b>
      </text>
      <For each={agents()}>
        {(agent) => (
          <box
            onClick={() => props.onSelect(agent)}
            backgroundColor={
              agent.issueId === props.selectedId()
                ? theme.colors.selection
                : undefined
            }
          >
            <text>
              {agent.issueId === props.selectedId() ? "▸ " : "  "}
              {agent.issueId}
            </text>
            <text fg={theme.colors.dim}>
              {agent.state === "running" ? "●" : "○"} {formatDuration(agent.startedAt)}
            </text>
            {agent.hasBlockingNotification && (
              <text fg={theme.colors.warning}>⚠ blocked</text>
            )}
          </box>
        )}
      </For>
    </box>
  );
}

function formatDuration(startedAt: Date): string {
  const mins = Math.floor((Date.now() - startedAt.getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}
```

### StatusBar

```tsx
// components/status-bar.tsx
import { For } from "solid-js";
import { theme } from "../theme.ts";

interface Shortcut {
  key: string;
  label: string;
}

interface StatusBarProps {
  shortcuts: Shortcut[];
}

export function StatusBar(props: StatusBarProps) {
  return (
    <box flexDirection="row" justifyContent="space-between" padding={1}>
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
      <text fg={theme.colors.dim}>q:quit</text>
    </box>
  );
}
```

### SpawnModal

Modal shown when clicking an issue to spawn an agent:

```tsx
// components/spawn-modal.tsx
import { createSignal } from "solid-js";
import { Portal, useRenderer } from "@opentui/solid";
import { theme } from "../theme.ts";
import type { ParsedIssue } from "workhorse-core";

interface SpawnModalProps {
  issue: ParsedIssue;
  onSpawn: (config: SpawnConfig) => void;
  onClose: () => void;
}

interface SpawnConfig {
  issueId: string;
  harness: string;
  baseBranch: string;
}

export function SpawnModal(props: SpawnModalProps) {
  const renderer = useRenderer();
  const [harness, setHarness] = createSignal("pi");
  const [baseBranch, setBaseBranch] = createSignal("main");

  const handleSpawn = () => {
    props.onSpawn({
      issueId: props.issue.key,
      harness: harness(),
      baseBranch: baseBranch(),
    });
  };

  return (
    <Portal mount={renderer.root}>
      <box
        flexDirection="column"
        borderStyle="rounded"
        title="Spawn Agent"
        padding={1}
        width={45}
        backgroundColor={theme.colors.background}
      >
        <text>
          <b>Issue:</b> {props.issue.key} — {props.issue.title}
        </text>

        <box marginTop={1}>
          <text>Harness:</text>
          <select
            options={[
              { name: "Pi Coding Agent", value: "pi" },
              { name: "Claude Code", value: "claude-code" },
            ]}
            onItemSelected={(_, opt) => setHarness(opt.value)}
          />
        </box>

        <box marginTop={1}>
          <text>Base branch:</text>
          <input
            value={baseBranch()}
            onInput={(e) => setBaseBranch(e.target.value)}
          />
        </box>

        <box flexDirection="row" gap={2} marginTop={2}>
          <text>
            <b>[Enter]</b> Spawn
          </text>
          <text>
            <b>[ESC]</b> Cancel
          </text>
        </box>
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

### createIssues

Fetches outstanding issues from configured Jira/GitHub sources:

```typescript
// primitives/create-issues.ts
import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { ParsedIssue } from "workhorse-core";
import { useWorkhorse } from "../context/workhorse.tsx";

export function createIssues(): Accessor<ParsedIssue[]> {
  const { hooks, tracker } = useWorkhorse();
  const [issues, setIssues] = createSignal<ParsedIssue[]>([]);

  onMount(() => {
    // Initial fetch
    tracker.fetchBacklog().then(setIssues);

    // Refresh on changes
    const refresh = () => tracker.fetchBacklog().then(setIssues);

    hooks.on("issue.parsed", refresh);
    hooks.on("issue.status_changed", refresh);
    hooks.on("agent.create.post", refresh); // Remove from backlog when picked up

    onCleanup(() => {
      hooks.off("issue.parsed", refresh);
      hooks.off("issue.status_changed", refresh);
      hooks.off("agent.create.post", refresh);
    });
  });

  return issues;
}
```

### createAgents

```typescript
// primitives/create-agents.ts
import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";
import type { AgentAdapter } from "workhorse-core";
import { useWorkhorse } from "../context/workhorse.tsx";

export function createAgents(): Accessor<AgentAdapter[]> {
  const { orchestrator, hooks } = useWorkhorse();
  const [agents, setAgents] = createSignal<AgentAdapter[]>(orchestrator.getAll());

  onMount(() => {
    const refresh = () => setAgents(orchestrator.getAll());

    hooks.on("agent.create.post", refresh);
    hooks.on("agent.stop.post", refresh);
    hooks.on("agent.idle", refresh);

    onCleanup(() => {
      hooks.off("agent.create.post", refresh);
      hooks.off("agent.stop.post", refresh);
      hooks.off("agent.idle", refresh);
    });
  });

  return agents;
}
```

### createChat

Chat state for the selected issue/agent:

```typescript
// primitives/create-chat.ts
import { createSignal, createEffect, onMount, onCleanup, type Accessor } from "solid-js";
import { useWorkhorse } from "../context/workhorse.tsx";

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
}

export function createChat(issueId: Accessor<string | null>) {
  const { hooks, memory, orchestrator } = useWorkhorse();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);

  // Reset messages when issue changes
  createEffect(() => {
    const id = issueId();
    if (id) {
      // Load history from L1 memory
      const history = memory.l1.getChatHistory(id);
      setMessages(history);
    } else {
      setMessages([]);
    }
  });

  onMount(() => {
    // Listen for new agent output
    const handleOutput = ({ issueId: id, delta }: { issueId: string; delta: string }) => {
      if (id === issueId()) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "agent") {
            // Append to existing agent message
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + delta },
            ];
          }
          // New agent message
          return [
            ...prev,
            { id: crypto.randomUUID(), role: "agent", content: delta, timestamp: new Date() },
          ];
        });
      }
    };

    hooks.on("agent.output", handleOutput);

    onCleanup(() => {
      hooks.off("agent.output", handleOutput);
    });
  });

  const send = (content: string) => {
    const id = issueId();
    if (!id) return;

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);

    // Send to agent via orchestrator
    // The orchestrator will handle injecting the message into the agent's session
    const adapter = orchestrator.get(id);
    if (adapter) {
      adapter.inject(content);
    }
  };

  return { messages, send };
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

    // Special: quit on 'q' (only when not in input)
    if (event.name === "q" && keyMap["q"]) {
      renderer.destroy();
    }
  });
}
```

## UI State (Solid Signals)

Using Solid signals instead of Zustand — no external state library needed:

```typescript
// state/ui.ts
import { createSignal } from "solid-js";
import type { ParsedIssue } from "workhorse-core";

export type Screen = "overview" | "agent" | "help";
export type Modal = "spawn" | null;

// Global UI state signals
const [screen, setScreen] = createSignal<Screen>("overview");
const [modal, setModal] = createSignal<Modal>(null);
const [selectedAgentId, setSelectedAgentId] = createSignal<string | null>(null);
const [spawnIssue, setSpawnIssue] = createSignal<ParsedIssue | null>(null);

export const ui = {
  // Accessors (read)
  screen,
  modal,
  selectedAgentId,
  spawnIssue,

  // Actions (write)
  setScreen,
  openSpawnModal: (issue: ParsedIssue) => {
    setSpawnIssue(issue);
    setModal("spawn");
  },
  closeModal: () => {
    setModal(null);
    setSpawnIssue(null);
  },
  enterAgentView: (agentId: string) => {
    setSelectedAgentId(agentId);
    setScreen("agent");
  },
  backToOverview: () => {
    setScreen("overview");
  },
};
```

## Context (Workhorse Provider)

```tsx
// context/workhorse.tsx
import { createContext, useContext, type JSX } from "solid-js";
import type { Orchestrator, Hooks, Memory, Tracker, Config } from "workhorse-core";

interface WorkhorseContextValue {
  orchestrator: Orchestrator;
  hooks: Hooks;
  memory: Memory;
  tracker: Tracker;
  config: Config;
}

const WorkhorseContext = createContext<WorkhorseContextValue>();

export function useWorkhorse(): WorkhorseContextValue {
  const ctx = useContext(WorkhorseContext);
  if (!ctx) throw new Error("useWorkhorse must be used within WorkhorseProvider");
  return ctx;
}

interface WorkhorseProviderProps extends WorkhorseContextValue {
  children: JSX.Element;
}

export function WorkhorseProvider(props: WorkhorseProviderProps) {
  const value = {
    orchestrator: props.orchestrator,
    hooks: props.hooks,
    memory: props.memory,
    tracker: props.tracker,
    config: props.config,
  };

  return (
    <WorkhorseContext.Provider value={value}>
      {props.children}
    </WorkhorseContext.Provider>
  );
}
```

## App Root

```tsx
// app.tsx
import { Match, Switch, Show } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { WorkhorseProvider } from "./context/workhorse.tsx";
import { Overview } from "./screens/overview.tsx";
import { Agent } from "./screens/agent.tsx";
import { Help } from "./screens/help.tsx";
import { SpawnModal } from "./components/spawn-modal.tsx";
import { ui } from "./state/ui.ts";
import { createKeyboardHandler } from "./primitives/create-keyboard.ts";
import type { Orchestrator, Hooks, Memory, Tracker, Config } from "workhorse-core";

interface AppProps {
  orchestrator: Orchestrator;
  hooks: Hooks;
  memory: Memory;
  tracker: Tracker;
  config: Config;
}

export function App(props: AppProps) {
  const renderer = useRenderer();

  createKeyboardHandler({
    "?": () => ui.setScreen("help"),
    q: () => renderer.destroy(),
    escape: () => {
      if (ui.modal()) {
        ui.closeModal();
      } else if (ui.screen() !== "overview") {
        ui.backToOverview();
      }
    },
  });

  return (
    <WorkhorseProvider
      orchestrator={props.orchestrator}
      hooks={props.hooks}
      memory={props.memory}
      tracker={props.tracker}
      config={props.config}
    >
      <box flexDirection="column" width="100%" height="100%">
        <Switch>
          <Match when={ui.screen() === "overview"}>
            <Overview />
          </Match>
          <Match when={ui.screen() === "agent"}>
            <Agent />
          </Match>
          <Match when={ui.screen() === "help"}>
            <Help />
          </Match>
        </Switch>

        {/* Spawn modal */}
        <Show when={ui.modal() === "spawn" && ui.spawnIssue()}>
          <SpawnModal
            issue={ui.spawnIssue()!}
            onSpawn={(config) => {
              props.orchestrator.spawn(config);
              ui.closeModal();
            }}
            onClose={ui.closeModal}
          />
        </Show>
      </box>
    </WorkhorseProvider>
  );
}
```

## Overview Screen

Simple layout: large chat on top, issues and agents side-by-side below.

```tsx
// screens/overview.tsx
import { createSignal } from "solid-js";
import { IssueList } from "../components/issue-list.tsx";
import { AgentList } from "../components/agent-list.tsx";
import { ChatBox } from "../components/chat-box.tsx";
import { StatusBar } from "../components/status-bar.tsx";
import { ui } from "../state/ui.ts";
import { theme } from "../theme.ts";
import type { ParsedIssue, AgentAdapter } from "workhorse-core";

export function Overview() {
  const [messages] = createSignal([
    {
      id: "1",
      role: "system" as const,
      content: "Welcome! Select an issue to spawn an agent, or click on a running agent to view its progress.",
    },
  ]);

  const handleIssueSelect = (issue: ParsedIssue) => {
    ui.openSpawnModal(issue);
  };

  const handleAgentSelect = (agent: AgentAdapter) => {
    ui.enterAgentView(agent.issueId);
  };

  const shortcuts = [
    { key: "Enter", label: "select" },
    { key: "?", label: "help" },
  ];

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box borderStyle="single" padding={1}>
        <text>
          <b>Workhorse</b>
        </text>
      </box>

      {/* Large chat area */}
      <ChatBox
        messages={messages}
        onSend={() => {}}
        placeholder="Ask a question or type a command..."
      />

      {/* Bottom section: Issues and Agents side by side */}
      <box flexDirection="row" height={10}>
        <IssueList onSelect={handleIssueSelect} />
        <AgentList onSelect={handleAgentSelect} />
      </box>

      {/* Status bar */}
      <StatusBar shortcuts={shortcuts} />
    </box>
  );
}
```

## Agent Screen

Sidebar with agents + full chat for selected agent.

```tsx
// screens/agent.tsx
import { AgentSidebar } from "../components/agent-sidebar.tsx";
import { ChatBox } from "../components/chat-box.tsx";
import { StatusBar } from "../components/status-bar.tsx";
import { ui } from "../state/ui.ts";
import { createChat } from "../primitives/create-chat.ts";
import { createAgents } from "../primitives/create-agents.ts";
import { theme } from "../theme.ts";
import type { AgentAdapter } from "workhorse-core";

export function Agent() {
  const agents = createAgents();
  const chat = createChat(ui.selectedAgentId);

  const selectedAgent = () =>
    agents().find((a) => a.issueId === ui.selectedAgentId());

  const handleAgentSelect = (agent: AgentAdapter) => {
    ui.enterAgentView(agent.issueId);
  };

  const handleSend = (message: string) => {
    chat.send(message);
  };

  const shortcuts = [
    { key: "Enter", label: "send" },
    { key: "s", label: "stop" },
    { key: "ESC", label: "back" },
  ];

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header with agent info */}
      <box borderStyle="single" padding={1} flexDirection="row" justifyContent="space-between">
        <text>
          <b>{selectedAgent()?.issueId ?? "Agent"}</b>
          <span fg={theme.colors.dim}> — {selectedAgent()?.issue?.title ?? ""}</span>
        </text>
        <text fg={theme.colors.success}>
          {selectedAgent()?.state === "running" ? "● running" : "○ stopped"}
        </text>
      </box>

      {/* Main content: sidebar + chat */}
      <box flexDirection="row" flexGrow={1}>
        {/* Agent sidebar */}
        <AgentSidebar
          selectedId={ui.selectedAgentId}
          onSelect={handleAgentSelect}
        />

        {/* Chat area */}
        <ChatBox
          messages={chat.messages}
          onSend={handleSend}
          placeholder="Send a message to the agent..."
        />
      </box>

      {/* Status bar */}
      <StatusBar shortcuts={shortcuts} />
    </box>
  );
}
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
  "include": ["src/**/*"]
}
```

## package.json

```json
{
  "name": "@fdcn/workhorse",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "bin": {
    "workhorse": "./src/index.ts"
  },
  "exports": {
    ".": "./src/index.ts",
    "./plugin": "./src/plugin.ts",
    "./renderers": "./src/renderers/index.ts"
  },
  "dependencies": {
    "workhorse-core": "workspace:*",
    "workhorse-plugin-jira": "workspace:*",
    "workhorse-plugin-github": "workspace:*",
    "workhorse-plugin-pi-adapter": "workspace:*",
    "solid-js": "^1.9.0",
    "@opentui/solid": "^0.1.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

The TUI package:
- **`@fdcn/workhorse`** - standalone application package
- **`startTUI()`** - exported function to launch the TUI (used by CLI)
- **Exports `./plugin`** - so other packages can import the TUI plugin if needed
- **Imports plugins directly** - Jira, GitHub, and pi-adapter plugins are bundled

## Keyboard Shortcuts

### Global
| Key | Action |
|-----|--------|
| `q` | Quit |
| `?` | Help screen |
| `ESC` | Close modal / Back to overview |

### Overview Screen
| Key | Action |
|-----|--------|
| `j/k` or `↑/↓` | Navigate lists |
| `Tab` | Switch between Issues and Agents lists |
| `Enter` | Select (spawn modal for issue, enter agent view for agent) |

### Agent Screen
| Key | Action |
|-----|--------|
| `j/k` or `↑/↓` | Navigate agent sidebar |
| `Enter` | Send message / Switch agent |
| `s` | Stop current agent |
| `ESC` | Back to overview |

### Spawn Modal
| Key | Action |
|-----|--------|
| `Enter` | Confirm and spawn agent |
| `Tab` | Switch between fields |
| `ESC` | Cancel and close modal |

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

## Testing with ht (Headless Terminal)

For integration and E2E testing, we use [ht](https://github.com/andyk/ht) - a headless terminal that wraps binaries with a JSON API. This allows programmatic testing of the TUI without needing a real terminal.

### Setup

```bash
# Install ht
cargo install --git https://github.com/andyk/ht

# Or download binary from releases
curl -L https://github.com/andyk/ht/releases/latest/download/ht-x86_64-apple-darwin -o ht
chmod +x ht
```

### ht Test Helper

```typescript
// __tests__/helpers/ht.ts
import { spawn, type Subprocess } from "bun";

interface HtSnapshot {
  cols: number;
  rows: number;
  text: string;
}

export class HeadlessTerminal {
  private proc: Subprocess;
  private stdout: ReadableStreamDefaultReader<string>;
  
  static async start(command: string[], options?: { cols?: number; rows?: number }) {
    const cols = options?.cols ?? 80;
    const rows = options?.rows ?? 24;
    
    const proc = spawn(["ht", "--size", `${cols}x${rows}`, "--subscribe", "snapshot,init", ...command], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    
    const ht = new HeadlessTerminal(proc);
    await ht.waitForInit();
    return ht;
  }
  
  private constructor(proc: Subprocess) {
    this.proc = proc;
    this.stdout = proc.stdout.getReader();
  }
  
  async sendKeys(keys: string[]): Promise<void> {
    const cmd = JSON.stringify({ type: "sendKeys", keys });
    this.proc.stdin.write(cmd + "\n");
  }
  
  async sendInput(text: string): Promise<void> {
    const cmd = JSON.stringify({ type: "input", payload: text });
    this.proc.stdin.write(cmd + "\n");
  }
  
  async takeSnapshot(): Promise<HtSnapshot> {
    const cmd = JSON.stringify({ type: "takeSnapshot" });
    this.proc.stdin.write(cmd + "\n");
    
    // Read snapshot event from stdout
    const { value } = await this.stdout.read();
    const event = JSON.parse(value);
    return event.data;
  }
  
  async resize(cols: number, rows: number): Promise<void> {
    const cmd = JSON.stringify({ type: "resize", cols, rows });
    this.proc.stdin.write(cmd + "\n");
  }
  
  private async waitForInit(): Promise<void> {
    const { value } = await this.stdout.read();
    const event = JSON.parse(value);
    if (event.type !== "init") {
      throw new Error(`Expected init event, got ${event.type}`);
    }
  }
  
  async close(): Promise<void> {
    this.proc.kill();
  }
}
```

### E2E Tests with ht

```typescript
// __tests__/e2e/overview.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HeadlessTerminal } from "../helpers/ht.ts";

describe("Overview Screen (E2E)", () => {
  let ht: HeadlessTerminal;
  
  beforeEach(async () => {
    ht = await HeadlessTerminal.start(["bun", "run", "bin/workhorse-tui.ts"], {
      cols: 80,
      rows: 24,
    });
  });
  
  afterEach(async () => {
    await ht.close();
  });
  
  it("shows welcome message on start", async () => {
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("Workhorse");
    expect(snapshot.text).toContain("Welcome!");
    expect(snapshot.text).toContain("ISSUES");
    expect(snapshot.text).toContain("AGENTS");
  });
  
  it("navigates to agent view on Enter", async () => {
    // Navigate to agents list
    await ht.sendKeys(["Tab"]); // Move to agents pane
    await ht.sendKeys(["Enter"]); // Select first agent
    
    const snapshot = await ht.takeSnapshot();
    
    // Should show agent dashboard with sidebar
    expect(snapshot.text).toContain("AGENTS");
    expect(snapshot.text).toContain("[ESC]back");
  });
  
  it("opens spawn modal when selecting issue", async () => {
    await ht.sendKeys(["Enter"]); // Select first issue
    
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("Spawn Agent");
    expect(snapshot.text).toContain("Harness:");
    expect(snapshot.text).toContain("[Enter] Spawn");
  });
  
  it("closes modal on Escape", async () => {
    await ht.sendKeys(["Enter"]); // Open spawn modal
    await ht.sendKeys(["Escape"]); // Close it
    
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).not.toContain("Spawn Agent");
    expect(snapshot.text).toContain("Welcome!");
  });
  
  it("quits on q", async () => {
    await ht.sendKeys(["q"]);
    
    // Process should exit
    await expect(ht.proc.exited).resolves.toBeDefined();
  });
});
```

```typescript
// __tests__/e2e/agent-chat.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HeadlessTerminal } from "../helpers/ht.ts";

describe("Agent Chat (E2E)", () => {
  let ht: HeadlessTerminal;
  
  beforeEach(async () => {
    ht = await HeadlessTerminal.start(["bun", "run", "bin/workhorse-tui.ts"], {
      cols: 80,
      rows: 24,
    });
    
    // Navigate to an agent
    await ht.sendKeys(["Tab"]); // Agents pane
    await ht.sendKeys(["Enter"]); // Select agent
  });
  
  afterEach(async () => {
    await ht.close();
  });
  
  it("shows chat input", async () => {
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("[Enter]send");
  });
  
  it("sends message on Enter", async () => {
    await ht.sendInput("Hello agent");
    await ht.sendKeys(["Enter"]);
    
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("Hello agent");
  });
  
  it("displays PR comment notification in chat", async () => {
    // Simulate a PR comment notification via mock
    // (would be injected via test fixtures)
    
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("💬");
    expect(snapshot.text).toContain("PR Comment");
  });
  
  it("displays Jira comment notification in chat", async () => {
    // Simulate a Jira comment notification
    
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("🎫");
    expect(snapshot.text).toContain("Jira Comment");
  });
  
  it("shows blocked status when agent is stuck", async () => {
    // Simulate agent becoming blocked
    
    const snapshot = await ht.takeSnapshot();
    
    expect(snapshot.text).toContain("⚠ BLOCKED");
  });
});
```

### Running E2E Tests

```bash
# Run all tests
bun run test

# Run only E2E tests
bun run test --filter e2e

# Run with ht live preview (for debugging)
HT_LIVE_PREVIEW=1 bun run test --filter e2e
```

### CI Configuration

```yaml
# .github/workflows/test.yml
- name: Install ht
  run: |
    curl -L https://github.com/andyk/ht/releases/latest/download/ht-x86_64-unknown-linux-gnu -o ht
    chmod +x ht
    sudo mv ht /usr/local/bin/

- name: Run TUI E2E tests
  run: bun run --filter @fdcn/workhorse test
```

## Future Enhancements

- **Themes**: Dark/light mode, custom color schemes via theme.ts
- **Mouse support**: OpenTUI supports mouse events on boxes
- **Split views**: Multiple agents visible using flexbox layout
- **Search**: Filter agents using `<input>` + derived signals
- **Logs view**: Full session log browser using `<scrollbox>`
- **Performance graphs**: Could use `<ascii_font>` for sparklines
- **Animations**: OpenTUI supports `useTimeline` for transitions
