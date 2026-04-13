# `src/core` — Business Logic SDK

The **core** module is the pure-TypeScript business-logic layer of Jiratown.  
It has **zero UI dependencies** and can be imported by the CLI, the TUI, tests, or any future consumer.

Everything the application *does* lives here: database operations, configuration management, git detection, session orchestration, agent lifecycle, notifications, background polling, and the embedded MCP server that agents talk to.

---

## Module Map

```
src/core/
├── index.ts              ← Public API (re-exports everything below)
│
├── db/                   ← SQLite persistence layer
│   ├── connection.ts     ← Database singleton + WAL init
│   ├── tickets.ts        ← Ticket CRUD
│   ├── events.ts         ← Ticket event log
│   ├── ticket-updates.ts ← Bulk ticket field updates
│   └── migrations/
│       ├── tickets.ts    ← Tickets + ticket_events schema
│       └── notifications.ts ← Notifications schema
│
├── config/               ← TOML config management
│   ├── paths.ts          ← ~/.jiratown/ and .jiratown.toml paths
│   ├── load.ts           ← Cascade-merge global + project config
│   ├── parse.ts          ← TOML parse, merge, serialize
│   ├── save.ts           ← Write global / project / theme config
│   └── defaults.ts       ← DEFAULT_CONFIG constant
│
├── git/
│   └── detect-rig.ts     ← Detect repo identity from git remote URL
│
├── session/              ← Process isolation layer
│   ├── tmux/             ← tmux session lifecycle
│   │   ├── tmux-operations.ts
│   │   └── tmux-utils.ts
│   ├── worktree/         ← git worktree lifecycle
│   │   ├── worktree-operations.ts
│   │   └── worktree-utils.ts
│   ├── session-memory.ts ← Persist agent context to .jiratown/context.md
│   ├── session-actions.ts
│   └── session-parser.ts
│
├── agent/
│   └── orchestrator/     ← Agent lifecycle management
│       ├── spawn-agent.ts    ← Full agent boot sequence
│       ├── orchestrator.ts   ← stop / sendMessage / captureOutput
│       ├── agent-store.ts    ← In-memory agent registry (Map)
│       ├── health-check.ts   ← Session + OpenCode health probing
│       ├── discover-agents.ts← Recover agents from tmux after restart
│       ├── mcp-config.ts     ← OpenCode .opencode/opencode.json writer
│       ├── prompt-builder.ts ← Context-aware prompt assembly
│       ├── system-prompt/    ← Initial and resume system prompts
│       └── opencode-client/  ← OpenCode HTTP SDK client + port manager
│
├── notifications/        ← Notification store & system instructions
│   ├── notification-store.ts ← SQLite CRUD, deduplication by source_id
│   ├── system-instruction.ts ← <system-instruction> block generator
│   └── types.ts
│
├── pollers/              ← Background polling loops
│   ├── jira-poller.ts    ← Poll Jira for new comments
│   ├── github-poller.ts  ← Poll GitHub PR for reviews + comments
│   └── agent-poller.ts   ← Poll tmux session for agent health
│
├── mcp-server/           ← Embedded MCP server (agents call this)
│   ├── server.ts         ← createJiratownServer (McpServer instance)
│   ├── tool-definitions.ts
│   ├── tool-names.ts
│   └── tools/
│       ├── get-notifications.ts
│       ├── acknowledge.ts
│       ├── update-status.ts
│       └── escalate.ts
│
└── clipboard.ts          ← Cross-platform clipboard read (pbpaste / xclip / wl-paste)
```

---

## Core Subsystems

### 1 — Database (`db/`)

SQLite via `bun:sqlite`. The database lives at `~/.jiratown/jiratown.db` and is initialized once on startup with WAL mode for concurrent read safety.

**Schema summary**

| Table | Purpose |
|---|---|
| `tickets` | One row per open Jira ticket. Tracks status, rig, agent, worktree path, branch, PR URL, last sync |
| `ticket_events` | Append-only activity log per ticket (status changes, file edits, escalations, etc.) |
| `notifications` | Agent-to-user messages persisted for display and acknowledgement |

**Key functions**

```ts
// One-time init (idempotent, runs migrations)
initDatabase(): Database

// Ticket CRUD
insertTicket(ticket: {...}): Ticket
getTicketById(id: string): Ticket | null
getTicketsByRig(rig: string): Ticket[]      // scoped to current repo
getAllTickets(): Ticket[]                    // global view
updateTicketStatus(id, status): void
updateTicket(id, fields): void              // partial update
deleteTicket(id): void                      // cascades ticket_events

// Event log
insertTicketEvent(ticketId, type, payload): void
getTicketEvents(ticketId, limit?): TicketEvent[]
```

**Ticket statuses** (state machine)

```
pending → queued → planning → implementing → blocked
                                           ↕
                                    testing → pr_created → in_review → done
```

---

### 2 — Configuration (`config/`)

Two-level TOML config with project-overrides-global merging.

**File locations**

| File | Scope |
|---|---|
| `~/.jiratown/config.toml` | Global (user-level) |
| `.jiratown.toml` in git root | Project-specific (optional) |

**Usage**

```ts
// Load and merge both config files
const config: ResolvedConfig = await loadConfig(cwd?);

// Save
saveGlobalConfig(config);
saveProjectConfig(config);
saveTheme("gruvbox");

// Paths
const { globalConfig, database, projectConfig } = getConfigPaths(projectRoot?);
```

**`ResolvedConfig` shape**

```ts
{
  jira: { cloud_id: string },
  defaults: { agent: "opencode" | "claude" },
  ui: { theme: "tokyonight" | "gruvbox" | "default" }
}
```

---

### 3 — Git / Rig Detection (`git/detect-rig.ts`)

A **rig** is the normalized git remote URL used as a unique identifier for a repository. This lets Jiratown scope tickets to the current project automatically.

```ts
const info: RigInfo | null = await detectRig(cwd?);
// { rig: "github.com/user/repo", gitRoot: "/home/user/repo", remoteUrl: "git@github.com:..." }
```

**URL normalization handles all common formats:**

| Input | Normalized |
|---|---|
| `git@github.com:user/repo.git` | `github.com/user/repo` |
| `https://github.com/user/repo.git` | `github.com/user/repo` |
| `ssh://git@github.com/user/repo` | `github.com/user/repo` |

---

### 4 — Session Management (`session/`)

Each Jira ticket gets its own **isolated environment** — a git worktree for code isolation and a tmux session for process isolation.

#### Tmux (`session/tmux/`)

Manages named tmux sessions (`jt-{ticketId}`, e.g., `jt-AM-123`).

```ts
// Session lifecycle
await createSession(ticketId, worktreePath): TmuxSession | null
await killSession(ticketId): boolean
await sessionExists(ticketId): boolean
await listSessions(): TmuxSession[]

// Interaction
await sendKeys(ticketId, keys, enterAfter?): boolean
await capturePane(ticketId): string | null   // capture visible tmux output

// Utilities
createTmuxSessionName(ticketId): string      // → "jt-AM-123"
buildTmuxCommand(ticketId, ...): string[]
parseTmuxList(raw: string): TmuxSession[]
```

#### Git Worktrees (`session/worktree/`)

Creates isolated git worktrees named `{repo}-worktrees/{ticketId}`. Branch names follow issue type conventions: `feat/`, `fix/`, `chore/`.

```ts
await createWorktree(repoPath, ticketId, issueType?, baseBranch?): Worktree | null
await removeWorktree(repoPath, ticketId, force?): boolean
await listWorktrees(repoPath): Worktree[]
await worktreeExists(repoPath, ticketId): boolean
await getWorktree(repoPath, ticketId): Worktree | null

// Path helpers
createWorktreePath(repoPath, ticketId): string
createBranchName(ticketId, issueType?): string  // e.g., "feat/AM-123"
```

#### Session Memory (`session/session-memory.ts`)

Persists agent context to `.jiratown/context.md` inside each worktree. This markdown file (with YAML frontmatter) allows agents to be resumed with full knowledge of prior work.

```ts
// Read / write
readSessionMemory(worktreePath): SessionMemory | null
writeSessionMemory(worktreePath, memory): boolean
createSessionMemory(ticketId, status, agent, branch, summary?): SessionMemory

// Mutate existing memory
addSessionEvent(worktreePath, event): void
addKeyDecision(worktreePath, decision: string): void
updateSessionStatus(worktreePath, status): void
hasSessionMemory(worktreePath): boolean
```

**`SessionMemory` shape**

```ts
{
  ticketId: string;
  status: string;
  agent: string;
  branch: string;
  startedAt: string;
  lastUpdatedAt: string;
  summary: string;
  recentActivity: SessionEvent[];  // capped at MAX_EVENTS (20)
  keyDecisions: string[];
}
```

---

### 5 — Agent Orchestration (`agent/orchestrator/`)

The orchestrator coordinates the full agent boot sequence and maintains an in-memory registry of running agents.

#### Agent State Machine

```
idle → starting → running → stopping → stopped
                          ↘ crashed
```

#### Spawning an agent (`spawn-agent.ts`)

`spawnAgent()` performs these steps atomically:

1. Check no agent is already running for this ticket
2. Create a git worktree (`createWorktree`)
3. Generate + write OpenCode MCP config (`.opencode/opencode.json`)
4. Kill any stale tmux session for this ticket
5. Create a new tmux session (`createSession`)
6. Build the initial prompt (`prepareAgentPrompt`)
7. Send the agent start command to tmux (`sendKeys`)
8. Update agent state to `"running"`

```ts
const result: SpawnResult = await spawnAgent({
  ticketId: "AM-123",
  agentType: "opencode",
  repoPath: "/home/user/myproject",
  jiraSummary: "Fix auth timeout",
  jiraDescription: "...",
  jiraCloudId: "mycompany.atlassian.net",
  jiraUrl: "https://mycompany.atlassian.net/browse/AM-123",
  issueType: "Story",      // determines branch prefix
  baseBranch: "main",
});
```

#### Stopping an agent (`orchestrator.ts`)

```ts
await stopAgent(ticketId, repoPath, removeWorktreeOnStop?)
```

Kills the tmux session, cleans up the MCP config, optionally removes the worktree, and removes the agent from the registry.

#### Agent registry (`agent-store.ts`)

```ts
getAgent(ticketId): AgentInstance | undefined
getAllAgents(): AgentInstance[]
getAgentsByState(state: AgentState): AgentInstance[]

// Direct messaging
await sendMessageToAgent(ticketId, message): boolean
await captureAgentOutput(ticketId): string | null
```

#### MCP Config generation (`mcp-config.ts`)

Writes `.opencode/opencode.json` into the agent's worktree. The config registers two MCP servers:

- **`jiratown`** — local, runs `src/mcp-server.sh --ticket <id>` so agents can call `jiratown_*` tools
- **`atlassian`** — remote, points to `https://mcp.atlassian.com/v1/mcp` (optional, when `jiraCloudId` provided)

#### System Prompts (`system-prompt/`)

```ts
// Full system prompt injected at agent launch
generateSystemPrompt(info: AgentSystemInstruction): string

// The initial `opencode --prompt` command text (includes /ticket command)
generateInitialPrompt(info: AgentSystemInstruction): string

// Resume prompt for agents restarted mid-ticket
generateResumePrompt(info: ResumeSystemInstruction): string
```

#### Agent Discovery (`discover-agents.ts`)

When Jiratown restarts, it recovers knowledge of running agents by scanning active tmux sessions:

```ts
await discoverAgents(): AgentInstance[]
await discoverAgentByTicketId(ticketId): AgentInstance | null
```

Sessions are identified by the `jt-` prefix in their name.

---

### 6 — Notifications (`notifications/`)

Notifications are the bridge between agents and the user. They are persisted in SQLite and displayed in the TUI's notification bar.

```ts
// Create (deduplicated by source_id + source_type)
createNotification(db, {
  ticket_id: "AM-123",
  source_type: "jira_comment" | "github_pr_review" | "github_pr_comment" | "agent",
  source_id: "comment-42",
  priority: "high" | "normal" | "low",
  summary: "PR review from @alice: CHANGES_REQUESTED",
  content: "Please add retry logic...",
  author: "alice",
  source_timestamp: "2024-01-15T10:30:00Z",
})

// Query
getUnreadNotifications(db, ticketId?): Notification[]
getNotificationsByTicket(db, ticketId): Notification[]
getNotificationBySource(db, sourceType, sourceId): Notification | null

// Lifecycle
markNotificationRead(db, id): void
markNotificationAcknowledged(db, id): void
acknowledgeNotifications(db, ids: string[]): void
deleteNotification(db, id): void
```

**System instruction generation**

Converts unread notifications into a `<system-instruction>` XML block that agents receive when they call `jiratown_get_notifications`. This tells the agent what requires their attention.

```ts
generateSystemInstruction(db, ticketId): string
```

---

### 7 — Pollers (`pollers/`)

Background loops that drive the notification pipeline. All pollers share a factory-function pattern with `start()`, `stop()`, `poll()`, and a `lastResult()` accessor.

**`createJiraPoller`** — Fetches Jira comments on a ticket at a configurable interval. Creates notifications for any comments not previously seen (tracked by comment ID).

**`createGitHubPoller`** — Fetches GitHub PR reviews and comments concurrently (`Promise.all`). Creates `high`-priority notifications for `CHANGES_REQUESTED` reviews.

**`createAgentPoller`** — Checks tmux session health and optionally queries the OpenCode HTTP API for status. Updates `AgentInstance` state.

```ts
const poller = createJiraPoller({
  db,
  ticketId: "AM-123",
  interval: 30_000,          // ms
  autoStart: true,
  fetchComments: async (id) => [...],
  onNewComments: (comments) => console.log("New comments:", comments),
  onError: (err) => console.error(err),
});

poller.start();
poller.stop();
await poller.poll();         // manual single poll
poller.lastResult();         // PollResult<JiraPollResult> | null
poller.state;                // "idle" | "running" | "stopped" | "error"
```

---

### 8 — MCP Server (`mcp-server/`)

An embedded **Model Context Protocol** server that runs inside each agent's tmux session (via `src/mcp-server.sh`). It exposes four tools agents use to communicate with Jiratown:

| Tool | Zod Schema | Purpose |
|---|---|---|
| `jiratown_get_notifications` | `{}` | Pull pending notifications + system instruction block |
| `jiratown_acknowledge` | `{ notification_ids: string[] }` | Mark notifications handled |
| `jiratown_update_status` | `{ status, message? }` | Report ticket progress status |
| `jiratown_escalate` | `{ questions, context, blocking }` | Ask user for clarification |

```ts
const { server, handlers } = createJiratownServer(db, ticketId);
// server is a McpServer instance from @modelcontextprotocol/sdk
```

**Valid status transitions reported by agents:**
`pending` → `planning` → `implementing` → `blocked` → `testing` → `pr_created` → `in_review` → `done`

---

### 9 — Utilities

**`clipboard.ts`** — Cross-platform clipboard reading:

```ts
await readClipboard(): string           // async, uses pbpaste / xclip / wl-paste / PowerShell
readClipboardSync(): string             // synchronous variant
```

---

## Public API

Everything above is re-exported from `src/core/index.ts`. Import from there for stable, co-located access:

```ts
import {
  // Database
  initDatabase, getDatabase, closeDatabase,
  insertTicket, getTicketById, getTicketsByRig, getAllTickets,
  updateTicket, updateTicketStatus, deleteTicket,
  insertTicketEvent, getTicketEvents,

  // Config
  loadConfig, saveGlobalConfig, saveProjectConfig, saveTheme,
  getConfigPaths, ensureConfigDir, configExists,
  parseTomlFile, mergeConfigs,

  // Git
  detectRig, getGitRoot, getRemoteUrl, normalizeRemoteUrl,

  // Session
  createSession, killSession, sessionExists, listSessions,
  sendKeys, capturePane, createTmuxSessionName,
  createWorktree, removeWorktree, listWorktrees, worktreeExists, getWorktree,
  readSessionMemory, writeSessionMemory, createSessionMemory,
  addSessionEvent, addKeyDecision, updateSessionStatus,

  // Agent Orchestration
  spawnAgent, stopAgent, checkAgentHealth,
  getAgent, getAllAgents, getAgentsByState,
  sendMessageToAgent, captureAgentOutput,
  discoverAgents, discoverAgentByTicketId,
  generateMcpConfig, writeMcpConfig, buildAgentCommand,
  generateSystemPrompt, generateInitialPrompt,

  // Notifications
  createNotification, getUnreadNotifications, getNotificationsByTicket,
  markNotificationRead, markNotificationAcknowledged, acknowledgeNotifications,
  generateSystemInstruction,

  // Pollers
  createJiraPoller, createGitHubPoller, createAgentPoller,

  // MCP Server
  createJiratownServer, TOOL_NAMES, getToolDefinitions,

  // Utilities
  readClipboard, readClipboardSync,
} from '../core/index.ts';
```

---

## Key Types

```ts
// Ticket
interface Ticket {
  id: string;               // Jira key, e.g., "AM-123"
  jira_key: string;
  rig: string;              // normalized git remote
  status: TicketStatus;
  agent: AgentType;         // "opencode" | "claude"
  worktree_path: string | null;
  branch_name: string | null;
  pr_url: string | null;
  summary: string | null;
  jira_url: string | null;
  created_at: string;
  updated_at: string;
  last_jira_sync: string | null;
}

// Agent
type AgentState = "idle" | "starting" | "running" | "stopping" | "stopped" | "crashed";

interface AgentInstance {
  ticketId: string;
  agentType: AgentType;
  state: AgentState;
  session: TmuxSession | null;
  worktree: Worktree | null;
  startedAt: string | null;
  stoppedAt: string | null;
  lastHealthCheck: string | null;
  mcpConfigPath: string | null;
}

// Notification
interface Notification {
  id: string;
  ticket_id: string;
  source_type: "jira_comment" | "github_pr_review" | "github_pr_comment" | "agent";
  source_id: string;
  priority: "high" | "normal" | "low";
  status: "unread" | "read" | "acknowledged";
  summary: string;
  content: string | null;
  author: string | null;
  source_timestamp: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
```

---

## Testing

Tests are colocated with source files as `.test.ts` files. Run with:

```bash
bun test src/core
```

The core layer uses no UI globals, making it fast and straightforward to unit test. Tests use `bun:sqlite` in-memory databases. Functions that shell out (`$`, `git`, `tmux`) are typically mocked via injected dependencies or `vi.mock`.

---

## Design Principles

1. **No UI imports** — `src/core` must never import from `src/tui` or `src/cli`.
2. **Pure functions where possible** — stateful modules (`agent-store`, `db/connection`) are singletons with `reset*` helpers for testing.
3. **Dependency injection for testability** — pollers, notifiers, and the MCP server accept their dependencies as constructor arguments.
4. **Explicit errors** — functions return typed result objects (`SpawnResult`, `StopResult`, `PollResult`) rather than throwing for expected failure modes.
