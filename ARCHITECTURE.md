# Jiratown Architecture & Code Flow Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Three-Layer Architecture](#three-layer-architecture)
4. [Directory Structure](#directory-structure)
5. [Core Layer (`src/core`)](#core-layer-srccore)
6. [TUI Layer (`src/tui`)](#tui-layer-srctui)
7. [CLI Layer (`src/cli`)](#cli-layer-srccli)
8. [Data Flow](#data-flow)
9. [Key Subsystems](#key-subsystems)
10. [Agent Lifecycle](#agent-lifecycle)
11. [Ticket State Machine](#ticket-state-machine)
12. [External Integrations](#external-integrations)
13. [Technology Stack](#technology-stack)

---

## Overview

**Jiratown** is a terminal UI dashboard built with [OpenTUI](https://github.com/anomalyco/opentui) + [Solid.js](https://solidjs.com) that orchestrates multiple AI coding agents (OpenCode or Claude Code) working on Jira tickets simultaneously.

### Key Capabilities

- **Multi-ticket dashboard**: Work on multiple Jira tickets in separate tabs
- **Multi-agent support**: Use OpenCode or Claude Code for each ticket
- **Real-time progress**: Stream agent activity with live updates
- **Jira sync**: Automatic comments, status transitions, and PR links
- **Non-blocking notifications**: Know when agents are blocked without interrupting workflow
- **Context-aware**: Auto-detects repository from git remote, filters tickets by repo

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Jiratown (OpenTUI + Solid.js)                │
│  - Manages MCP clients for Jira & GitHub APIs                   │
│  - SQLite for ticket/event/notification state                   │
│  - Orchestrates agents via tmux sessions + git worktrees        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
   │ tmux: jt-AM-123│ │ tmux: jt-AM-456│ │ tmux: jt-AR-789│
   │ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌────────────┐ │
   │ │ worktree/  │ │ │ │ worktree/  │ │ │ │ worktree/  │ │
   │ │  AM-123    │ │ │ │  AM-456    │ │ │ │  AR-789    │ │
   │ │ ┌────────┐ │ │ │ │ ┌────────┐ │ │ │ │ ┌────────┐ │ │
   │ │ │OpenCode│ │ │ │ │ │ Claude │ │ │ │ │ │OpenCode│ │ │
   │ │ └────────┘ │ │ │ │ └────────┘ │ │ │ │ └────────┘ │ │
   │ └────────────┘ │ │ └────────────┘ │ │ └────────────┘ │
   └────────────────┘ └────────────────┘ └────────────────┘
```

---

## Three-Layer Architecture

Jiratown uses a strict three-layer separation:

```
┌─────────────────────────────────────────────────────────────┐
│                     src/cli/                                │
│              Command-Line Interface Layer                   │
│         (citty commands, @clack/prompts for setup)          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     src/tui/                                │
│               Terminal User Interface Layer                 │
│            (Solid.js + OpenTUI components)                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     src/core/                               │
│                Business Logic Layer (SDK)                   │
│        (Pure functions, no UI dependencies)                 │
└─────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Purpose |
|-------|------------|---------|
| **CLI** | citty + @clack/prompts | Command handlers, interactive setup |
| **TUI** | Solid.js + OpenTUI | Visual components, reactive state |
| **Core** | Pure TypeScript | Business logic, database, integrations |

---

## Directory Structure

```
jiratown/
├── src/
│   ├── core/                       # 🧠 Business Logic Layer (SDK)
│   │   ├── index.ts                # Public API exports
│   │   ├── db/                     # SQLite database
│   │   │   ├── connection.ts       # DB initialization/lifecycle
│   │   │   ├── tickets.ts          # Ticket CRUD operations
│   │   │   ├── events.ts           # Event logging
│   │   │   ├── ticket-updates.ts   # Complex ticket updates
│   │   │   └── migrations/         # Schema migrations
│   │   ├── config/                 # TOML config management
│   │   │   ├── load.ts             # Load & merge configs
│   │   │   ├── save.ts             # Persist configs
│   │   │   ├── parse.ts            # TOML parsing
│   │   │   ├── paths.ts            # Config file locations
│   │   │   └── keychain.ts         # Secure credential storage
│   │   ├── git/                    # Git operations
│   │   │   └── detect-rig.ts       # Rig detection from remote
│   │   ├── session/                # Tmux + worktree management
│   │   │   ├── tmux/               # Tmux operations
│   │   │   ├── worktree/           # Git worktree operations
│   │   │   ├── session-memory.ts   # Session state persistence
│   │   │   └── session-actions.ts  # Session event logging
│   │   ├── agent/                  # Agent orchestration
│   │   │   ├── orchestrator/       # Spawn/stop/monitor agents
│   │   │   │   ├── spawn-agent.ts  # Agent spawning logic
│   │   │   │   ├── mcp-config.ts   # MCP config generation
│   │   │   │   ├── system-prompt/  # Prompt templates
│   │   │   │   └── opencode-client/# OpenCode SDK integration
│   │   │   ├── event-formatter/    # Agent event formatting
│   │   │   └── summarizer/         # Agent status extraction
│   │   ├── jira/                   # Atlassian MCP client
│   │   │   ├── client.ts           # AtlassianClient class
│   │   │   ├── fetch-ticket-context.ts
│   │   │   ├── map-issue.ts        # Response mapping
│   │   │   └── sync.ts             # Jira sync utilities
│   │   ├── github/                 # GitHub MCP client
│   │   │   ├── client.ts           # GitHubClient class
│   │   │   ├── fetch-pr-context.ts # PR context fetching
│   │   │   └── mappers.ts          # Response mapping
│   │   ├── notifications/          # Notification system
│   │   │   ├── notification-store.ts
│   │   │   └── system-instruction.ts
│   │   ├── pollers/                # Background polling
│   │   │   ├── jira-poller.ts      # Jira comment detection
│   │   │   ├── github-poller.ts    # PR review detection
│   │   │   └── agent-poller.ts     # Agent health monitoring
│   │   ├── mcp-server/             # Jiratown MCP server (for agents)
│   │   │   ├── server.ts           # Server setup
│   │   │   └── tools/              # Tool handlers
│   │   ├── workflow/               # High-level ticket workflows
│   │   │   └── ticket-agent/       # Launch/halt/restart agents
│   │   └── utils/                  # Shared utilities
│   │
│   ├── tui/                        # 🖥️ TUI Layer
│   │   ├── app/                    # App shell
│   │   │   ├── app.tsx             # Root component with providers
│   │   │   ├── app-content.tsx     # Main content orchestration
│   │   │   ├── layout.tsx          # Dashboard layout
│   │   │   └── commands.ts         # Command definitions
│   │   ├── components/             # UI components
│   │   │   ├── ticket-sidebar/     # Left navigation panel
│   │   │   ├── ticket-pane/        # Main ticket detail view
│   │   │   ├── ticket-input/       # New ticket modal
│   │   │   ├── command-palette/    # Command launcher
│   │   │   ├── blocked-view/       # Blocked state display
│   │   │   ├── pr-review-view/     # PR review workflow
│   │   │   ├── button/             # Button variants
│   │   │   ├── modal/              # Modal container
│   │   │   ├── text-input/         # Text input field
│   │   │   ├── select/             # Selection component
│   │   │   └── ...                 # Other reusable components
│   │   ├── contexts/               # Solid.js contexts
│   │   │   ├── tickets-context.tsx # Ticket state management
│   │   │   ├── keyboard-context.ts # Keyboard handling
│   │   │   ├── navigation-context.ts
│   │   │   ├── workflow-context.tsx
│   │   │   └── event-log-context.tsx
│   │   ├── hooks/                  # UI-specific hooks
│   │   │   ├── use-config/         # Reactive config
│   │   │   ├── use-database/       # SQLite wrapper
│   │   │   ├── use-selection/      # List selection
│   │   │   ├── use-modal/          # Modal state
│   │   │   ├── use-notifications/  # Notification management
│   │   │   ├── use-agent-progress/ # Agent progress tracking
│   │   │   ├── use-pr-review/      # PR review workflow
│   │   │   └── use-layout-actions/ # Top-level actions
│   │   ├── theme/                  # Theme system
│   │   │   ├── colors.ts           # Color palette
│   │   │   ├── gruvbox.ts          # Gruvbox theme
│   │   │   ├── tokyonight.ts       # Tokyo Night theme
│   │   │   └── context.tsx         # Theme provider
│   │   └── sandbox/                # UI testing & demos
│   │
│   ├── cli/                        # ⌨️ CLI Layer
│   │   ├── index.ts                # Entry point (citty)
│   │   └── commands/
│   │       ├── setup/              # First-time setup
│   │       ├── add/                # Quick add ticket
│   │       ├── dashboard/          # TUI launcher
│   │       └── cleanup/            # Worktree cleanup
│   │
│   └── types/                      # Shared TypeScript types
│       ├── ticket.ts               # Ticket & event types
│       └── config.ts               # Configuration types
│
├── plugins/                        # Build plugins
├── scripts/                        # Development scripts
└── build.ts                        # Bun build script
```

---

## Core Layer (`src/core`)

The Core layer is a pure TypeScript SDK with **no UI dependencies**. All business logic lives here.

### Key Subsystems

#### 1. Database (`db/`)

SQLite-based persistence using Bun's built-in SQLite driver.

```typescript
// Key exports
initDatabase()           // Initialize DB connection
getDatabase()            // Get DB instance
insertTicket(ticket)     // Create ticket
updateTicket(id, fields) // Update ticket
getTicketById(id)        // Fetch single ticket
getTicketsByRig(rig)     // Filter by repository
insertTicketEvent(event) // Log ticket events
```

**Schema:**

```sql
-- Tickets table
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,              -- "AM-123"
  jira_key TEXT NOT NULL,
  jira_url TEXT,
  summary TEXT,
  status TEXT DEFAULT 'pending',    -- pending|queued|planning|implementing|blocked|pr_created|in_review|done
  rig TEXT NOT NULL,                -- Git remote URL
  worktree_path TEXT,
  branch_name TEXT,
  agent TEXT DEFAULT 'opencode',
  agent_pid INTEGER,
  pr_url TEXT,
  pr_number INTEGER,
  created_at TEXT,
  updated_at TEXT,
  last_jira_sync TEXT
);

-- Events table (activity log)
CREATE TABLE ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT REFERENCES tickets(id),
  event_type TEXT,                  -- status_change|file_modified|test_result|escalation|comment
  payload TEXT,                     -- JSON blob
  timestamp TEXT
);

-- Notifications table
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  source_type TEXT,                 -- jira_comment|github_review|agent_blocked|pr_comment
  source_id TEXT,
  priority TEXT,                    -- blocking|high|normal|low
  status TEXT,                      -- unread|read|acknowledged
  title TEXT,
  body TEXT,
  metadata TEXT,                    -- JSON
  created_at TEXT
);
```

#### 2. Configuration (`config/`)

TOML-based configuration with cascading overrides.

```
~/.jiratown/
├── config.toml      # Global config
└── jiratown.db      # SQLite database

<project>/.jiratown.toml  # Project-specific overrides
```

```typescript
interface ResolvedConfig {
  jira: { cloud_id: string };
  defaults: { agent: "opencode" | "claude" };
  ui: { theme: "tokyonight" | "gruvbox" | "default" };
  behavior: { auto_resume: boolean };
  prompt: { custom: string | null };
}
```

#### 3. Git / Rig Detection (`git/`)

Auto-detects repository from git remote URL.

```typescript
const rig = await detectRig();
// → { gitRoot: "/path/to/repo", rig: "github.com/user/repo" }
```

#### 4. Session Management (`session/`)

Manages tmux sessions and git worktrees.

**Tmux Operations:**
```typescript
createSession(sessionName, cwd)     // Create tmux session
killSession(sessionName)            // Kill session
sessionExists(sessionName)          // Check if exists
sendKeys(sessionName, keys)         // Send keystrokes
capturePane(sessionName)            // Capture output
```

**Worktree Operations:**
```typescript
createWorktree(ticketId, issueType, repoPath)
// → Creates: ../repo-worktrees/AM-123 with branch feat/AM-123

removeWorktree(ticketId, repoPath)
getWorktree(ticketId, repoPath)
listWorktrees(repoPath)
```

**Session Memory:**

Each ticket has a `.jiratown/context.md` file for state persistence:

```markdown
---
ticket_id: AM-123
status: implementing
started_at: 2024-01-15T10:30:00Z
last_checkpoint: 2024-01-15T11:45:00Z
---

## Recent Activity
- [10:35] Created feature branch
- [10:42] Modified src/auth.ts (retry logic)
- [11:15] Tests passing (5/5)

## Key Decisions
- Using exponential backoff for retries
- Max retry count: 5
```

#### 5. Agent Orchestration (`agent/orchestrator/`)

Spawns and manages AI agents.

```typescript
// Spawn agent
const result = await spawnAgent({
  ticketId: "AM-123",
  agent: "opencode",
  worktreePath: "/path/to/worktree",
  jiraIssue: { key: "AM-123", summary: "Fix bug", description: "..." },
  rig: "github.com/user/repo",
});

// Stop agent
await stopAgent("AM-123");

// Check health
const health = await checkAgentHealth("AM-123");
```

**MCP Config Generation:**

Generates OpenCode config with Jiratown MCP server:

```typescript
const config = generateMcpConfig(ticketId, port);
// → Creates ~/.config/opencode/config.json with Jiratown MCP tools
```

#### 6. Notifications (`notifications/`)

Manages agent notifications and system instructions.

```typescript
// Create notification
createNotification({
  ticketId: "AM-123",
  sourceType: "github_review",
  sourceId: "review-123",
  priority: "high",
  title: "PR Review: Changes Requested",
  body: "...",
});

// Generate system instruction for agent
const instruction = generateSystemInstruction(notifications);
```

#### 7. Pollers (`pollers/`)

Background polling for external updates.

```typescript
// Jira comment poller
const jiraPoller = createJiraPoller({
  ticketId: "AM-123",
  jiraClient,
  onComments: (comments) => { /* handle new comments */ },
});
jiraPoller.start();

// GitHub PR poller
const githubPoller = createGitHubPoller({
  ticketId: "AM-123",
  prUrl: "https://github.com/user/repo/pull/42",
  onReviews: (reviews) => { /* handle reviews */ },
});

// Agent health poller
const agentPoller = createAgentPoller({
  ticketId: "AM-123",
  onHealthChange: (health) => { /* handle state change */ },
});
```

#### 8. MCP Server (`mcp-server/`)

Exposes tools for agents to communicate with Jiratown.

**Tools:**
- `jiratown_get_notifications` - Get pending notifications
- `jiratown_acknowledge` - Mark notifications as handled
- `jiratown_update_status` - Update ticket progress
- `jiratown_escalate` - Ask questions to user/Jira
- `jiratown_open_pr` - Signal PR creation

#### 9. Workflow (`workflow/`)

High-level ticket workflow operations.

```typescript
// Launch agent for ticket
await launchTicketAgent({
  ticket,
  jiraIssue,
  gitRoot,
  agent: "opencode",
});

// Halt agent
await haltTicketAgent({ ticketId: "AM-123" });

// Restart agent
await restartTicketAgent({ ticketId: "AM-123", db });

// Resume all active tickets on startup
await resumeAllTicketAgents({ db, gitRoot, rig });
```

---

## TUI Layer (`src/tui`)

The TUI layer provides the visual interface using Solid.js + OpenTUI.

### Provider Stack

```tsx
<ThemeProvider>
  <NavigationProvider>
    <KeyboardProvider>
      <ModalSystemProvider>
        <AppContent />
      </ModalSystemProvider>
    </KeyboardProvider>
  </NavigationProvider>
</ThemeProvider>
```

### Key Components

#### `<App>` - Root Component

```tsx
export function App(props: AppProps) {
  // Loads config, manages theme
  return (
    <ThemeProvider>
      <NavigationProvider>
        <KeyboardProvider>
          <AppContent showAll={props.showAll} />
        </KeyboardProvider>
      </NavigationProvider>
    </ThemeProvider>
  );
}
```

#### `<Layout>` - Dashboard Shell

```
╭─ Jiratown ────────────────────── myproject ─ [?] help ─ [q] quit ─╮
│╭─ Tickets [+] ─╮                                                   │
││ ▶ AM-123      │  [Main content pane]                              │
││   AM-456      │                                                   │
│╰───────────────╯                                                   │
├────────────────────────────────────────────────────────────────────┤
│ Notification bar                                                   │
╰────────────────────────────────────────────────────────────────────╯
```

#### `<TicketSidebar>` - Left Panel

- Lists all tickets
- Shows status indicators
- Handles selection/navigation

#### `<TicketPane>` - Main Content

- Shows ticket details
- Displays agent progress
- Handles PR review workflow
- Shows blocked state view

### Hooks Reference

| Hook | Purpose |
|------|---------|
| `useConfig` | Reactive config load/save |
| `useDatabase` | SQLite lifecycle |
| `useSelection` | List selection state |
| `useModal` | Modal open/close |
| `useNotifications` | Notification management |
| `useAgentProgress` | Session memory reader |
| `useLayoutActions` | Top-level action wiring |
| `usePRReview` | PR review workflow |

### Context Reference

| Context | Purpose |
|---------|---------|
| `TicketsContext` | Ticket CRUD, selection, polling |
| `KeyboardContext` | Input mode management |
| `NavigationContext` | Focus lock management |
| `WorkflowContext` | Agent orchestration |
| `EventLogContext` | Ticket event history |

### Theme System

Three built-in themes: `default`, `tokyonight`, `gruvbox`

```typescript
const { theme, setTheme, toggleTheme } = useTheme();

// Access colors
theme().fg.primary   // Primary text color
theme().bg.base      // Base background
theme().accent       // Accent color
```

---

## CLI Layer (`src/cli`)

The CLI layer provides the command-line interface using citty.

### Commands

```bash
jiratown                    # Launch TUI dashboard
jiratown --all              # Show all tickets across repos
jiratown setup              # First-time setup
jiratown add <ticket>       # Quick add a ticket
jiratown cleanup            # Remove stale worktrees
jiratown cleanup --all      # Remove all without prompting
```

### Command Structure

Each command follows this pattern:

```
src/cli/commands/<command>/
├── index.ts       # citty command definition
├── run.ts         # Command implementation
└── *.test.ts      # Tests
```

---

## Data Flow

### Adding a New Ticket

```
User Input → CLI/TUI
     │
     ▼
parseTicketKey("AM-123" or Jira URL)
     │
     ▼
AtlassianClient.fetchIssue(ticketId)
     │
     ▼
insertTicket(ticket) → SQLite
     │
     ▼
createWorktree(ticketId) → Git
     │
     ▼
spawnAgent(options)
     │
     ├─► createSession(tmuxName) → Tmux
     │
     ├─► generateMcpConfig() → OpenCode config
     │
     └─► Execute agent command
```

### Agent Communication Flow

```
Jiratown Dashboard
       │
       ├─► Jiratown MCP Server (tools for agent)
       │      │
       │      ├─ jiratown_get_notifications
       │      ├─ jiratown_acknowledge
       │      ├─ jiratown_update_status
       │      └─ jiratown_escalate
       │
       ├─► Pollers (background)
       │      │
       │      ├─ jiraPoller → Atlassian MCP → Jira
       │      ├─ githubPoller → GitHub MCP → GitHub
       │      └─ agentPoller → tmux/OpenCode SDK
       │
       └─► Notifications → Agent System Inbox
```

---

## Agent Lifecycle

### State Machine

```
                    ┌─────────────┐
                    │   PENDING   │ (Just entered ticket)
                    └──────┬──────┘
                           │ Fetch Jira details
                           ▼
                    ┌─────────────┐
                    │   QUEUED    │ (Ready for agent)
                    └──────┬──────┘
                           │ Spawn agent in worktree
                           ▼
              ┌───▶┌─────────────┐
              │    │  PLANNING   │◀──────────────┐
              │    └──────┬──────┘               │
              │           │ Plan approved        │
              │           ▼                      │
              │    ┌─────────────┐               │
              ├───▶│IMPLEMENTING │◀───┐          │
              │    └──────┬──────┘    │          │
              │           │           │          │
        Clarification     │     Test failed      │
        received          │           │          │
              │           ▼           │          │
              │    ┌─────────────┐    │          │
              └────│   BLOCKED   │────┘          │
                   └──────┬──────┘               │
                          │ (Escalate to Jira)   │
                          ▼                      │
                   ┌─────────────┐               │
                   │ PR_CREATED  │               │
                   └──────┬──────┘               │
                          │                      │
                          ▼                      │
                   ┌─────────────┐  Changes      │
                   │ IN_REVIEW   │──requested────┘
                   └──────┬──────┘
                          │ Approved & merged
                          ▼
                   ┌─────────────┐
                   │    DONE     │
                   └─────────────┘
```

### Spawn Sequence

1. Validate ticket exists in DB
2. Create git worktree (`../repo-worktrees/<ticketId>`)
3. Generate MCP config with Jiratown server
4. Generate system prompt with Jira context
5. Create tmux session (`jt-<ticketId>`)
6. Execute agent command in tmux
7. Update ticket status to `implementing`
8. Register agent in memory store

---

## Ticket State Machine

| Status | Description |
|--------|-------------|
| `pending` | Ticket just entered, awaiting Jira fetch |
| `queued` | Jira details fetched, ready for agent |
| `planning` | Agent is analyzing/planning |
| `implementing` | Agent is writing code |
| `blocked` | Agent needs clarification |
| `pr_created` | PR opened, awaiting review |
| `in_review` | PR under review |
| `done` | PR merged, ticket complete |

---

## External Integrations

### Atlassian MCP (Jira)

- **Endpoint**: `https://mcp.atlassian.com/v1/mcp`
- **Transport**: `mcp-remote` proxy via stdio
- **Authentication**: OAuth 2.1

**Key Operations:**
```typescript
const client = createAtlassianClient({ cloudId });
await client.connect();
await client.fetchIssue("AM-123");
await client.addComment("AM-123", "Update...");
await client.transitionIssue("AM-123", "In Progress");
```

### GitHub MCP

- **Endpoint**: `https://api.githubcopilot.com/mcp/`
- **Transport**: `mcp-remote` proxy via stdio
- **Authentication**: OAuth

**Key Operations:**
```typescript
const client = createGitHubClient();
await client.getPullRequest(owner, repo, prNumber);
await client.listReviewComments(owner, repo, prNumber);
await client.createReview(owner, repo, prNumber, { body, event });
```

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Bun |
| **Language** | TypeScript |
| **UI Framework** | Solid.js |
| **TUI Library** | OpenTUI (`@opentui/solid`) |
| **Database** | SQLite (Bun built-in) |
| **Config** | TOML |
| **CLI** | citty |
| **CLI Prompts** | @clack/prompts |
| **Jira API** | Atlassian MCP |
| **GitHub API** | GitHub MCP |
| **MCP SDK** | @modelcontextprotocol/sdk |
| **Agent SDK** | @opencode-ai/sdk |
| **Credential Storage** | keytar |

### Code Standards

- **Max 200 lines per file**
- **kebab-case file names**
- **Colocated tests** (`*.test.ts`)
- **Index exports** for modules

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/core/index.ts` | Public SDK API |
| `src/tui/app/app.tsx` | Root TUI component |
| `src/cli/index.ts` | CLI entry point |
| `src/types/ticket.ts` | Ticket type definitions |
| `src/types/config.ts` | Config type definitions |
| `src/core/workflow/ticket-agent/launch.ts` | Agent launch logic |
| `src/core/agent/orchestrator/spawn-agent.ts` | Agent spawn implementation |
| `src/core/mcp-server/server.ts` | Jiratown MCP server |

---

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Run sandbox (component demos)
bun run sandbox

# Run tests
bun test

# Build
bun run build
```

---

## See Also

- [README.md](./README.md) - Quick start guide
- [PLAN.md](./PLAN.md) - Detailed planning document
- [CONTEXT.md](./CONTEXT.md) - AI agent context
- [src/core/README.md](./src/core/README.md) - Core layer docs
- [src/tui/README.md](./src/tui/README.md) - TUI layer docs
- [src/cli/README.md](./src/cli/README.md) - CLI layer docs
