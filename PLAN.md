# Jiratown

> A terminal UI dashboard for orchestrating multiple AI coding agents working on Jira tickets simultaneously.

## Overview

**Jiratown** is a TUI application (built with OpenTUI + Solid.js) that enables developers to:

1. Open multiple Jira tickets as "tabs" in a terminal dashboard
2. Spawn AI coding agents (OpenCode or Claude Code) to work on each ticket
3. Monitor real-time progress across all agents
4. Keep Jira in sync with agent progress (comments, status transitions, PR links)
5. Handle blocked states with non-blocking notifications

Uses native Jira MCP integration for seamless ticket management.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Jiratown (OpenTUI + Solid.js)                │
│  - Manages MCP client for Jira API                              │
│  - SQLite for ticket state                                      │
│  - Orchestrates agents via tmux sessions + git worktrees        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
   │ tmux: jiratown │ │ tmux: jiratown │ │ tmux: jiratown │
   │      -AM-123   │ │      -AM-456   │ │      -AR-789   │
   │ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌────────────┐ │
   │ │ worktree/  │ │ │ │ worktree/  │ │ │ │ worktree/  │ │
   │ │  AM-123    │ │ │ │  AM-456    │ │ │ │  AR-789    │ │
   │ │ ┌────────┐ │ │ │ │ ┌────────┐ │ │ │ │ ┌────────┐ │ │
   │ │ │OpenCode│ │ │ │ │ │ Claude │ │ │ │ │ │OpenCode│ │ │
   │ │ └────────┘ │ │ │ │ └────────┘ │ │ │ │ └────────┘ │ │
   │ └────────────┘ │ │ └────────────┘ │ │ └────────────┘ │
   └────────────────┘ └────────────────┘ └────────────────┘
```

### Core Components

| Component         | Technology             | Purpose                                    |
| ----------------- | ---------------------- | ------------------------------------------ |
| **UI**            | OpenTUI + Solid.js     | Terminal user interface                    |
| **Storage**       | SQLite                 | Ticket state and events                    |
| **Config**        | TOML                   | User preferences, Jira cloud ID            |
| **CLI**           | citty + @clack/prompts | CLI framework and interactive prompts      |
| **Jira API**      | Atlassian MCP          | Fetch tickets, post comments, transitions  |
| **Orchestration** | tmux + git worktrees   | Isolated sessions and workspaces per ticket|
| **Agents**        | OpenCode, Claude Code  | AI coding agents                           |

### Rig Detection

A "rig" is identified by the **git remote URL** of the current repository. When you run `jiratown` in a directory:

1. Detect the git root via `git rev-parse --show-toplevel`
2. Get the remote URL via `git remote get-url origin`
3. Normalize the URL (e.g., `git@github.com:user/repo.git` → `github.com/user/repo`)
4. Use this as the rig identifier for filtering tickets

This means:

- No manual rig configuration needed
- Just run `jiratown` in any git repository
- Tickets are automatically scoped to the current repo

---

## User Flow

### Complete Flow: Ticket → Agent Working

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User in Dashboard                                │
│                                                                          │
│   1. User runs `jiratown` in a git repository                           │
│      → Rig auto-detected from git remote (e.g., github.com/user/repo)   │
│                              │                                           │
│                              ▼                                           │
│   2. User enters: "AM-123" or "https://adeptmind.atlassian.net/.../AM-123"
│                              │                                           │
│                              ▼                                           │
│   3. Dashboard fetches Jira ticket details via Atlassian MCP            │
│                              │                                           │
│                              ▼                                           │
│   4. Dashboard inserts ticket into SQLite with:                         │
│      - rig = "github.com/user/repo" (from git remote)                   │
│      - agent = "opencode" (default, can override)                       │
│      - status = "pending"                                               │
│                              │                                           │
│                              ▼                                           │
│   5. User confirms / selects different agent                            │
│                              │                                           │
│                              ▼                                           │
│   6. Dashboard creates git worktree for ticket                          │
│      git worktree add ../worktrees/AM-123 -b feat/AM-123                │
│                              │                                           │
│                              ▼                                           │
│   7. Dashboard creates tmux session and spawns agent                    │
│      tmux new-session -d -s jiratown-AM-123 -c ../worktrees/AM-123      │
│      tmux send-keys -t jiratown-AM-123 'opencode' Enter                 │
│                              │                                           │
│                              ▼                                           │
│   8. Agent works on ticket in isolated worktree                         │
│                              │                                           │
│                              ▼                                           │
│   9. Dashboard monitors agent process and updates UI                    │
│                              │                                           │
│                              ▼                                           │
│  10. Dashboard syncs progress back to Jira (comments, status)           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Ticket State Machine

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

---

## CLI Interface

```bash
# First-time setup
jiratown setup

# Start dashboard (context-aware - shows only current repo's tickets)
cd /path/to/myproject
jiratown

# Start dashboard (global view - all tickets across all rigs)
jiratown --all

# Quick add ticket without full TUI
jiratown add AM-123
jiratown add AM-123 --agent claude
```

---

## Storage & Configuration

### File Locations

```
~/.jiratown/
├── config.toml           # Global config (user-level defaults)
└── jiratown.db           # SQLite database

/path/to/project/
└── .jiratown.toml        # Project-specific config (optional, overrides global)
```

### Config Resolution Order

Configuration is resolved with cascading overrides:

1. **Global config** (`~/.jiratown/config.toml`) - User-level defaults
2. **Project config** (`.jiratown.toml` in git root) - Project-specific overrides

Project config merges with global config. Project values override global values for the same keys.

### Global config.toml

```toml
# ~/.jiratown/config.toml

[jira]
cloud_id = "adeptmind.atlassian.net" # Default Jira instance

[defaults]
agent = "opencode" # or "claude"
```

### Project-specific .jiratown.toml (optional)

```toml
# /path/to/project/.jiratown.toml

[jira]
cloud_id = "differentcompany.atlassian.net" # Override for this project

[defaults]
agent = "claude" # This project prefers Claude
```

This enables:

- **Multiple Jira instances**: Different projects can use different Atlassian clouds
- **Per-project agent preference**: Some projects may work better with specific agents
- **Team-shared config**: Commit `.jiratown.toml` to share settings across the team

### SQLite Schema

```sql
-- Tracks all tickets opened across repos
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,              -- "AM-123"
  jira_key TEXT NOT NULL,
  jira_url TEXT,
  summary TEXT,
  status TEXT DEFAULT 'pending',    -- pending|queued|planning|implementing|blocked|pr_created|in_review|done

  -- Worktree integration
  rig TEXT NOT NULL,                -- Git remote URL (e.g., "github.com/user/repo")
  worktree_path TEXT,               -- Path to git worktree
  branch_name TEXT,                 -- Branch name (e.g., "feat/AM-123")

  -- Agent config
  agent TEXT DEFAULT 'opencode',    -- opencode|claude
  agent_pid INTEGER,                -- Process ID of running agent

  -- PR tracking
  pr_url TEXT,

  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Jira sync state
  last_jira_sync TEXT
);

-- Tracks events for each ticket (activity log)
CREATE TABLE ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT REFERENCES tickets(id),
  event_type TEXT,                  -- status_change|file_modified|test_result|escalation|comment
  payload TEXT,                     -- JSON blob
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_tickets_rig ON tickets(rig);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_events_ticket ON ticket_events(ticket_id);
```

---

## UI Design

### Main Dashboard View

```
╭─ Jiratown ─────────────────────────────── myproject ─ [?] help ─ [q] quit ─╮
│╭─ Tickets [+] New ─╮                                                        │
││ ▶ AM-123          │ AM-123: Fix authentication timeout bug                 │
││ ⬆ AM-456          │ ═══════════════════════════════════════════════════    │
││ ○ AM-789          │                                                        │
││                   │ Status    IMPLEMENTING          Agent     opencode     │
││                   │ Phase     GREEN (5/5 passing)   Rig       myproject    │
││                   │ Worktree  ../myproject-worktrees/AM-123                 │
││                   │                                                        │
││                   │ ┌─ Progress ──────────────────────────────────────────┐│
││                   │ │ ✓ Fetched Jira ticket                               ││
││                   │ │ ✓ Created worktree                                  ││
││                   │ │ ✓ Planning complete                                 ││
││                   │ │ ▶ Creating PR...                                    ││
││                   │ └─────────────────────────────────────────────────────┘│
││                   │                                                        │
││                   │ [e] escalate  [a] switch agent  [o] open jira  [x] close│
│╰───────────────────╯                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ No notifications                                                            │
╰─────────────────────────────────────────────────────────────────────────────╯
```

The sidebar is clickable and supports keyboard navigation:
- `j`/`k` or `↑`/`↓` to navigate tickets
- `1-9` for quick jump
- `n` or `+` for new ticket
- Click on any ticket to select it

### New Ticket Modal

```
╭─ Add Ticket ────────────────────────────────────────────────╮
│                                                              │
│  Ticket:  AM-123                                             │
│           ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  │
│           Enter ticket key or paste Jira URL                 │
│                                                              │
│  Agent:   ● OpenCode  ○ Claude Code                          │
│                                                              │
│                          [Enter] Start   [Esc] Cancel        │
╰──────────────────────────────────────────────────────────────╯
```

### Blocked State View

```
╭─ AM-456 ─ BLOCKED ──────────────────────────────────────────╮
│                                                              │
│  ⚠️  Agent needs clarification                               │
│                                                              │
│  Questions posted to Jira:                                   │
│  ─────────────────────────────────────────────────────────   │
│  1. Should the retry limit be configurable via env var?      │
│  2. What's the expected behavior when Redis is unavailable?  │
│                                                              │
│  Posted: 3 minutes ago                                       │
│                                                              │
│  [j] View in Jira    [r] Resume (check for response)         │
│  [c] Cancel ticket   [h] Handoff to other agent              │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

### PR Review View

```
╭─ AM-123 ─ IN_REVIEW ─────────────────────────────────────────╮
│                                                              │
│  PR #42: Fix authentication timeout bug                      │
│  ══════════════════════════════════════                      │
│                                                              │
│  Review Status: Changes Requested (2 comments)               │
│                                                              │
│  ┌─ Comment 1 ─────────────────────────────────────────────┐ │
│  │ @reviewer1 (2h ago):                                    │ │
│  │ "Consider using exponential backoff instead of fixed    │ │
│  │  retry intervals."                                      │ │
│  │                                                         │ │
│  │ Draft Reply:                                            │ │
│  │ ┌─────────────────────────────────────────────────────┐ │ │
│  │ │ Good suggestion! I'll update the retry logic to use │ │ │
│  │ │ exponential backoff with jitter. Will push a fix.   │ │ │
│  │ └─────────────────────────────────────────────────────┘ │ │
│  │                                                         │ │
│  │ Your input (optional):                                  │ │
│  │ ┌─────────────────────────────────────────────────────┐ │ │
│  │ │ Use base 2, max 30s cap                             │ │ │
│  │ └─────────────────────────────────────────────────────┘ │ │
│  │                                                         │ │
│  │ [c] Reply Only    [a] Reply + Address with Changes      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Comment 2 ─────────────────────────────────────────────┐ │
│  │ @reviewer2 (1h ago):                                    │ │
│  │ "Missing test case for network timeout scenario."       │ │
│  │ ...                                                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  [A] Address All Comments   [p] View PR   [j] View Jira     │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

### PR Review Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Poll PR for new reviews/comments                        │
│                          │                                  │
│                          ▼                                  │
│  2. Agent drafts reply for each comment                     │
│                          │                                  │
│                          ▼                                  │
│  3. User reviews drafts, adds optional guidance             │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              ▼                       ▼                      │
│     [Reply Only]            [Reply + Changes]               │
│         │                        │                          │
│         ▼                        ▼                          │
│  4a. Post comment         4b. Post comment +                │
│      to PR                    cycle to PLANNING             │
│         │                        │                          │
│         │                        ▼                          │
│         │                 5. Implement changes              │
│         │                    (all in one commit)            │
│         │                        │                          │
│         │                        ▼                          │
│         │                 6. Push commit                    │
│         │                        │                          │
│         │                        ▼                          │
│         │                 7. Reply with commit ref          │
│         │                        │                          │
│         └────────────────────────┘                          │
│                          │                                  │
│                          ▼                                  │
│  8. Re-request review (if changes made)                     │
│                          │                                  │
│                          ▼                                  │
│  9. Return to IN_REVIEW, await next feedback                │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Integration Points

| Action              | Command/API                             | Description               |
| ------------------- | --------------------------------------- | ------------------------- |
| **Fetch Jira**      | Atlassian MCP `getJiraIssue`            | Get ticket details        |
| **Create Worktree** | `git worktree add`                      | Create isolated workspace |
| **Create Session**  | `tmux new-session -d -s jiratown-{id}`  | Create isolated tmux session |
| **Spawn Agent**     | `tmux send-keys`                        | Start agent in tmux session |
| **Monitor Agent**   | `tmux capture-pane` / process management| Track agent status        |
| **Debug Agent**     | `tmux attach -t jiratown-{id}`          | Attach to agent session   |
| **Update Jira**     | Atlassian MCP `addCommentToJiraIssue`   | Post progress             |
| **Transition Jira** | Atlassian MCP `transitionJiraIssue`     | Change status             |
| **Escalate**        | Jira comment                            | Ask questions             |
| **Fetch PR**        | GitHub MCP `get_pull_request`           | Get PR details            |
| **Get Reviews**     | GitHub MCP `get_pull_request_reviews`   | Fetch review comments     |
| **Reply to Review** | GitHub MCP `create_pull_request_review` | Post reply comments       |

---

## Technology Stack

| Component        | Technology                                       |
| ---------------- | ------------------------------------------------ |
| **Runtime**      | Bun                                              |
| **Language**     | TypeScript                                       |
| **UI Framework** | Solid.js                                         |
| **TUI Library**  | OpenTUI (`@opentui/solid`)                       |
| **Database**     | SQLite (`better-sqlite3`)                        |
| **Config**       | TOML                                             |
| **CLI**          | citty (zero-dep CLI framework)                   |
| **CLI Prompts**  | @clack/prompts (interactive setup)               |
| **Jira API**     | Atlassian MCP (`atlassian/atlassian-mcp-server`) |
| **GitHub API**   | GitHub MCP (`github/github-mcp-server`)          |

### Dependencies

```json
{
  "dependencies": {
    "@opentui/core": "^0.1.90",
    "@opentui/solid": "^0.1.90",
    "solid-js": "^1.9.10",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "toml": "^3.0.0",
    "citty": "^0.2.1",
    "@clack/prompts": "^1.1.0"
  }
}
```

---

## Project Structure

**Code Standards:**
- All files must be **max 200 lines of code**
- All file names use **kebab-case**
- Related files are **colocated in folders** with `index.ts` exports

```
jiratown/
├── package.json
├── tsconfig.json
├── bunfig.toml                     # Solid.js preload config
├── build.ts                        # Bun build script
├── scripts/
│   └── seed.ts                     # Dev seed data for testing
│
├── src/
│   ├── index.ts                    # CLI entry point (citty)
│   │
│   ├── commands/
│   │   ├── setup/                  # `jiratown setup`
│   │   │   ├── index.ts
│   │   │   ├── run.ts
│   │   │   └── dependencies.ts
│   │   ├── add/                    # `jiratown add <ticket>`
│   │   │   ├── index.ts
│   │   │   ├── run.ts
│   │   │   └── parse-ticket.ts
│   │   └── dashboard/              # `jiratown` (default - launches TUI)
│   │       ├── index.ts
│   │       └── run.tsx
│   │
│   ├── app/
│   │   ├── app.tsx                 # Root component
│   │   └── layout.tsx              # Shell with header/sidebar/footer
│   │
│   ├── components/
│   │   ├── ticket-sidebar/         # Sidebar navigation
│   │   │   ├── index.ts
│   │   │   ├── ticket-sidebar.tsx
│   │   │   ├── ticket-item.tsx
│   │   │   ├── sidebar-header.tsx
│   │   │   └── use-ticket-navigation.ts
│   │   ├── button/                 # Button components
│   │   │   ├── index.ts
│   │   │   ├── button.tsx
│   │   │   ├── key-hint.tsx
│   │   │   └── action-bar.tsx
│   │   ├── status-badge/           # Status display
│   │   │   ├── index.ts
│   │   │   ├── status-badge.tsx
│   │   │   └── agent-badge.tsx
│   │   ├── command-palette/        # Command palette (fuzzy search)
│   │   │   ├── index.ts
│   │   │   ├── command-palette.tsx
│   │   │   ├── command-item.tsx
│   │   │   └── use-fuzzy-search.ts
│   │   └── ... (future components follow same pattern)
│   │
│   ├── hooks/
│   │   ├── index.ts                # Re-exports all hooks
│   │   ├── use-interactive.ts      # Hover/press/focus state management
│   │   ├── use-modal.ts            # Modal state management
│   │   ├── use-focus-zone.ts       # Focus region management
│   │   ├── use-selection.ts        # List selection logic
│   │   ├── use-tickets.ts          # Ticket CRUD operations
│   │   ├── use-config.ts           # Config load/save
│   │   ├── use-database.ts         # SQLite wrapper
│   │   ├── use-agent.ts            # Agent spawning/management
│   │   ├── use-atlassian.ts        # Jira MCP client
│   │   ├── use-github.ts           # GitHub MCP client
│   │   ├── use-agent-feed.ts       # Agent event stream
│   │   ├── use-command-palette.ts  # Command search/execute
│   │   ├── use-pr-review.ts        # PR review workflow
│   │   └── use-escalation.ts       # Escalation workflow
│   │
│   ├── harness/                    # Agent orchestration infrastructure
│   │   ├── notifications/          # Notification system
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── notification-store.ts
│   │   │   └── system-instruction.ts
│   │   ├── mcp-server/             # Jiratown MCP server for agents
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── server.ts
│   │   │   └── tools/
│   │   │       ├── index.ts
│   │   │       ├── get-notifications.ts
│   │   │       ├── acknowledge.ts
│   │   │       ├── update-status.ts
│   │   │       └── escalate.ts
│   │   ├── session/                # Process & code isolation
│   │   │   ├── index.ts
│   │   │   ├── tmux.ts             # Tmux session management
│   │   │   └── worktree.ts         # Git worktree management
│   │   ├── pollers/                # Background monitoring (TODO)
│   │   │   ├── jira-poller.ts
│   │   │   └── github-poller.ts
│   │   └── orchestrator/           # Agent lifecycle (TODO)
│   │       └── orchestrator.ts
│   │
│   ├── lib/
│   │   ├── theme/                  # Theme system
│   │   │   ├── index.ts
│   │   │   ├── colors.ts
│   │   │   ├── status.ts
│   │   │   ├── presets.ts
│   │   │   └── utils.ts
│   │   ├── db/                     # Database (refactored into folder)
│   │   │   ├── index.ts
│   │   │   ├── connection.ts
│   │   │   ├── tickets.ts
│   │   │   ├── ticket-updates.ts
│   │   │   ├── events.ts
│   │   │   └── migrations/
│   │   │       ├── tickets.ts
│   │   │       └── notifications.ts
│   │   ├── db.ts                   # Re-exports from db/ for compatibility
│   │   ├── config.ts               # TOML parsing + config merging
│   │   └── detect-rig.ts           # Detect rig from git remote URL
│   │
│   └── types/
│       ├── ticket.ts
│       ├── config.ts
│       └── agent.ts                # Agent event types
│
└── README.md
```

---

## Modularization & Hooks Architecture

### Design Principles

1. **Separation of Concerns**: UI components should be purely presentational; all business logic lives in hooks
2. **Reusability**: Hooks can be composed and reused across different components
3. **Testability**: Hooks can be unit tested independently of UI rendering
4. **Single Responsibility**: Each hook handles one specific domain (theme, keyboard, tickets, etc.)

### Hook Categories

#### UI State Hooks
Manage local UI state and user interactions:

| Hook | Purpose | Location |
|------|---------|----------|
| `useTheme` | Theme switching and persistence | `src/lib/theme/context.tsx` |
| `useKeyboard` | Global keyboard shortcut handling | `@opentui/solid` |
| `useInteractive` | Hover/press/focus states for clickable elements | `src/hooks/use-interactive.ts` |
| `useModal` | Modal open/close state management | `src/hooks/use-modal.ts` |
| `useFocusZone` | Focus management within regions | `src/hooks/use-focus-zone.ts` |
| `useSelection` | List selection state (single/multi) | `src/hooks/use-selection.ts` |

#### Data Hooks
Manage data fetching, caching, and mutations:

| Hook | Purpose | Location |
|------|---------|----------|
| `useTickets` | CRUD operations for tickets | `src/hooks/use-tickets.ts` |
| `useConfig` | Load/save configuration | `src/hooks/use-config.ts` |
| `useDatabase` | SQLite connection and queries | `src/hooks/use-database.ts` |

#### Integration Hooks
Interface with external services and CLIs:

| Hook | Purpose | Location |
|------|---------|----------|
| `useTmux` | Tmux session management | `src/hooks/use-tmux.ts` |
| `useAgent` | Agent spawning and management | `src/hooks/use-agent.ts` |
| `useAtlassian` | Atlassian MCP client | `src/hooks/use-atlassian.ts` |
| `useGitHub` | GitHub MCP client | `src/hooks/use-github.ts` |
| `useAgentFeed` | Stream `gt feed --json` events | `src/hooks/use-agent-feed.ts` |

#### Feature Hooks
Compose lower-level hooks for specific features:

| Hook | Purpose | Location |
|------|---------|----------|
| `useTicketNavigation` | Keyboard nav for ticket list | `src/components/ticket-sidebar/` |
| `useCommandPalette` | Command search and execution | `src/hooks/use-command-palette.ts` |
| `usePRReview` | PR review workflow state | `src/hooks/use-pr-review.ts` |
| `useEscalation` | Ticket escalation workflow | `src/hooks/use-escalation.ts` |

### Component Structure

Components should follow this pattern:

```tsx
// Good: Component uses hooks for all logic
function TicketSidebar(props: TicketSidebarProps) {
  const { theme } = useTheme();
  const { tickets, select, selectedIndex } = useTickets();
  const { navigateUp, navigateDown } = useTicketNavigation();
  
  // Pure rendering based on hook state
  return <box>...</box>;
}

// Bad: Component contains business logic
function TicketSidebar(props: TicketSidebarProps) {
  const [tickets, setTickets] = createSignal([]);
  
  // Don't fetch data directly in component
  createEffect(async () => {
    const data = await db.query('SELECT * FROM tickets');
    setTickets(data);
  });
  
  return <box>...</box>;
}
```

### Hook Composition Example

```tsx
// Feature hook composes multiple lower-level hooks
function useTicketWorkflow(ticketId: string) {
  const { theme } = useTheme();
  const { ticket, updateTicket } = useTickets();
  const { spawn, stop } = useAgent();
  const { createWorktree } = useWorktree();
  const { fetchIssue, addComment } = useAtlassian();
  
  const startWork = async () => {
    const jiraData = await fetchIssue(ticketId);
    const worktree = await createWorktree(ticketId, jiraData.key);
    await spawn(ticketId, 'opencode', worktree.path);
    await updateTicket(ticketId, { status: 'implementing' });
  };
  
  return { ticket, startWork };
}
```

### `useInteractive` Hook

The `useInteractive` hook provides a standardized way to handle hover and press states for interactive elements. This eliminates repetitive state management code across components.

> **Note:** OpenTUI does not support `onFocus`/`onBlur` on box elements, so focus handling is not included.

**API:**
```tsx
interface UseInteractiveOptions {
  disabled?: boolean;           // Disable all interactions
  onPress?: () => void;         // Click/press handler
  onHover?: (hovered: boolean) => void;  // Hover state change
}

interface InteractiveProps {
  onMouseOver: () => void;
  onMouseOut: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
}

interface UseInteractiveReturn {
  isHovered: Accessor<boolean>;     // Currently hovered
  isPressed: Accessor<boolean>;     // Currently being pressed
  isHighlighted: Accessor<boolean>; // Alias for isHovered (convenience)
  interactiveProps: InteractiveProps; // Spread onto element
}
```

**Usage:**
```tsx
function Button(props: ButtonProps) {
  const { theme } = useTheme();
  const { isHighlighted, interactiveProps } = useInteractive({
    disabled: props.disabled,
    onPress: props.onPress,
  });

  const bgColor = () => isHighlighted() ? theme().bg.highlight : theme().bg.base;

  return (
    <box backgroundColor={bgColor()} {...interactiveProps}>
      <text>{props.label}</text>
    </box>
  );
}

function TicketItem(props: TicketItemProps) {
  const { theme } = useTheme();
  const { isHovered, isHighlighted, interactiveProps } = useInteractive({
    onPress: props.onSelect,
  });

  // Combine selection state with hover
  const showHighlight = () => props.isSelected || isHighlighted();
  const bgColor = () => {
    if (props.isSelected) return theme().bg.highlight;
    if (isHovered()) return theme().bg.elevated;
    return undefined;
  };

  return (
    <box backgroundColor={bgColor()} {...interactiveProps}>
      <text>{props.ticket.id}</text>
    </box>
  );
}
```

### Hooks Directory Structure

```
src/hooks/
├── index.ts                    # Re-exports all hooks
├── use-interactive.ts          # Hover/press/focus state management
├── use-modal.ts                # Modal state management
├── use-focus-zone.ts           # Focus region management
├── use-selection.ts            # List selection logic
├── use-tickets.ts              # Ticket CRUD operations
├── use-config.ts               # Config load/save
├── use-database.ts             # SQLite wrapper
├── use-tmux.ts                 # Tmux session management
├── use-agent.ts                # Agent spawning/management (uses useTmux)
├── use-atlassian.ts            # Jira MCP client
├── use-github.ts               # GitHub MCP client
├── use-agent-feed.ts           # Agent event stream
├── use-command-palette.ts      # Command search/execute
├── use-pr-review.ts            # PR review workflow
└── use-escalation.ts           # Escalation workflow
```

---

## Implementation Phases

### Phase 1: Foundation (4-5 days)

- [x] Project scaffolding with OpenTUI + Solid.js
- [x] CLI entry point with citty
- [x] `jiratown setup` command (using @clack/prompts)
  - [x] Check for required dependencies (Bun)
  - [x] Offer to install missing dependencies
  - [x] Collect Jira cloud ID
  - [x] Configure default agent
- [x] Config file parsing/writing (TOML)
  - [x] Global config (`~/.jiratown/config.toml`)
  - [x] Project config (`.jiratown.toml` in git root)
  - [x] Config merging (project overrides global)
- [x] SQLite database setup with migrations
- [x] Git rig detection from remote URL
- [x] Basic TUI shell (Layout with sidebar)
- [x] UI styling and theming
  - [x] Define color palette (primary, secondary, accent, status colors)
  - [x] Create theme module (`src/lib/theme/`) with colors, status, presets, utils
  - [x] Style Layout component (borders, colors, spacing)
  - [x] Style TicketSidebar (clickable items, keyboard navigation)
  - [x] Style status badges (pending, queued, implementing, blocked, done)
  - [x] Add consistent typography and spacing
- [x] Clickable sidebar with mouse support
- [x] Keyboard navigation (j/k, arrows, 1-9, n/+)
- [x] Core UI hooks (foundation for all components)
  - [x] `useInteractive` - Hover/press states with interactiveProps spread syntax
  - [x] `useModal` - Modal open/close state, escape to close, focus trap
  - [x] `useFocusZone` - Focus management within regions (sidebar, main, modals)
  - [x] `useSelection` - List selection state (single/multi-select, keyboard nav)
  - [x] `useHotkeys` - Register/unregister keyboard shortcuts by context
- [x] Core data hooks
  - [x] `useTickets` - Ticket CRUD operations wrapping SQLite
  - [x] `useConfig` - Reactive config load/save with persistence
  - [x] `useDatabase` - SQLite connection management and query helpers
- [x] Basic reusable components
  - [x] Modal component (for dialogs and overlays)
  - [x] TextInput component (for form fields)
  - [x] Select/RadioGroup component (for agent selection)
  - [x] Card component (for content containers)
  - [x] Divider component (for visual separation)
  - [x] Button component (for actions and form submissions)
  - [x] CommandPalette component (fuzzy search command launcher)

### Phase 2: Ticket Management (4-5 days)

- [x] `useAtlassian` hook (Atlassian MCP client)
  - [x] Connect via `mcp-remote` proxy to `https://mcp.atlassian.com/v1/mcp`
  - [x] Handle OAuth 2.1 authentication flow
  - [x] `fetchIssue(ticketId)` - Get ticket details
  - [x] `addComment(ticketId, comment)` - Post comment
  - [x] `transitionIssue(ticketId, status)` - Change status
- [x] Ticket input modal (TicketInput component using `useModal`)
- [x] TicketPane component (uses `useTickets` hook)
- [x] Integrate `useAtlassian` with `useTickets` for Jira sync

### Phase 3: Agent Integration (4-5 days)

#### Agent Harness (Core Infrastructure)
- [x] Notification system (`src/harness/notifications/`)
  - [x] Notification types (blocking, high, normal, low priorities)
  - [x] Notification store (SQLite CRUD with deduplication by source_id)
  - [x] System instruction generator (`<system-instruction>` blocks)
- [x] Jiratown MCP Server (`src/harness/mcp-server/`)
  - [x] `jiratown_get_notifications` - Get pending notifications + system instruction
  - [x] `jiratown_acknowledge` - Mark notifications as handled
  - [x] `jiratown_update_status` - Update ticket progress status
  - [x] `jiratown_escalate` - Ask questions / request clarification
  - [x] Tool registration with `@modelcontextprotocol/sdk`
- [x] Session management (`src/harness/session/`)
  - [x] Tmux session management (`tmux.ts`)
    - [x] `createSession(ticketId)` - Create isolated tmux session
    - [x] `killSession(ticketId)` - Kill tmux session
    - [x] `listSessions()` - List active Jiratown sessions
    - [x] `sendKeys(ticketId, keys)` - Send keystrokes to session
    - [x] `capturePane(ticketId)` - Capture session output
    - [x] Session naming: `jt-{ticketId}` (e.g., `jt-AM-123`)
  - [x] Git worktree management (`worktree.ts`)
    - [x] `createWorktree(ticketId, issueType)` - Create worktree for ticket
    - [x] `removeWorktree(ticketId)` - Clean up worktree
    - [x] `getWorktree(ticketId)` - Get worktree details
    - [x] `listWorktrees()` - List all Jiratown worktrees
    - [x] Branch naming by issue type (feat/, fix/, chore/)
    - [x] Worktree path: `{repo}-worktrees/{ticketId}`
- [x] Database migrations for notifications table
- [x] Agent orchestrator (`src/harness/orchestrator/`)
  - [x] Spawn agent with MCP config in worktree
  - [x] Generate temporary agent config with Jiratown MCP
  - [x] Coordinate tmux session + worktree lifecycle
- [x] Background pollers (`src/harness/pollers/`)
  - [x] Jira comment poller (detect new comments)
  - [x] GitHub PR poller (detect reviews, comments)
  - [x] Agent status poller (check tmux session health)

#### UI Hooks (wrapping harness)
- [x] `useTmux` hook (wraps `src/harness/session/tmux.ts`)
- [x] `useAgent` hook (agent spawning and management)
  - [x] `spawn(ticketId, agent, worktree)` - Spawn agent in tmux session
  - [x] `stop(ticketId)` - Stop running agent and kill session
  - [x] `listRunning()` - Get list of running agents
  - [x] `getStatus(ticketId)` - Get agent status
- [x] `useWorktree` hook (wraps `src/harness/session/worktree.ts`)
- [x] Agent process management
  - [x] Track spawned processes via tmux sessions
  - [x] Handle process exit/errors
  - [ ] Auto-restart on crash (optional)
  - [x] Attach to session for debugging: `tmux attach -t jt-AM-123`

### Phase 4: Progress & Sync (3-4 days)

- [ ] `useJiraSync` hook (Jira synchronization)
  - [ ] `postProgress(ticketId, message)` - Post progress comment
  - [ ] `transitionStatus(ticketId, status)` - Update Jira status
  - [ ] `linkPR(ticketId, prUrl)` - Add PR link to ticket
- [ ] `useEventLog` hook (event persistence)
  - [ ] Log agent events to SQLite
  - [ ] Query event history by ticket/agent
  - [ ] Support event replay for debugging
- [ ] ProgressLog component (uses `useEventLog`)
- [ ] FileChanges component (uses `useAgentFeed` events)

### Phase 5: PR Review & Iteration (3-4 days)

- [ ] `useGitHub` hook (GitHub MCP client)
  - [ ] Connect via `mcp-remote` proxy to `https://api.githubcopilot.com/mcp/`
  - [ ] Handle OAuth authentication flow
  - [ ] `getPullRequest(owner, repo, number)` - Get PR details
  - [ ] `listPullRequests(owner, repo, state)` - List PRs
  - [ ] `createReview(owner, repo, number, body, event)` - Submit review
  - [ ] `listReviewComments(owner, repo, number)` - Get review comments
- [ ] `usePRReview` hook (PR review workflow)
  - [ ] Poll for new comments/change requests
  - [ ] Track review state (pending, approved, changes_requested)
  - [ ] Compose review responses
- [ ] `PRReviewView` component (`src/components/PRReviewView.tsx`)
  - [ ] Display pending review comments
  - [ ] Show agent's draft response for each comment
  - [ ] User input field to modify/augment response
  - [ ] Action buttons: Reply Only / Reply + Address Changes / Address All
- [ ] `ReviewCommentCard` component (`src/components/ReviewCommentCard.tsx`)
- [ ] Review response workflow:
  - [ ] Agent analyzes comment and drafts reply
  - [ ] User reviews draft, can edit or add guidance
  - [ ] User chooses: **Reply only** or **Reply + Make Changes**
  - [ ] If changes: cycle back to PLANNING with all PR feedback as context
  - [ ] Make **one combined commit** addressing all requested changes
  - [ ] Post reply comments referencing the commit
- [ ] Re-request review after changes pushed
- [ ] Sync PR review status to Jira (optional comment)

### Phase 6: Notifications & Blocked State (2-3 days)

- [ ] Notifications bar component
- [ ] BlockedView component
- [ ] Escalation detection from agent events
- [ ] Resume action (nudge agent to check responses)
- [ ] Handoff action (switch to different agent)
- [ ] View in Jira action (open browser)
- [ ] Cancel ticket action

### Phase 7: Polish (2-3 days)

- [ ] Keyboard shortcuts (full mapping)
- [ ] Error handling & recovery
- [ ] Agent switching per ticket
- [ ] Global view (`--all` flag)
- [ ] Help screen (`?` key)
- [ ] Context-aware behavior (detect rig from git remote)
- [ ] Graceful shutdown (cleanup MCP, save state)

---

## Setup Flow

```
$ jiratown setup

┌  Jiratown Setup
│
◇  Checking dependencies...
│  ✓ Bun v1.3.x
│
◆  Jira cloud ID (e.g., yourcompany.atlassian.net):
│  adeptmind.atlassian.net
│
◆  Default agent:
│  ● OpenCode (recommended)
│  ○ Claude Code
│
◇  Config saved to ~/.jiratown/config.toml
◇  Database created at ~/.jiratown/jiratown.db
│
└  Setup complete! Run 'jiratown' in any git repo to start.
```

Note: Rigs are auto-detected from git remote URL - no manual configuration needed.

---

## Future Enhancements

1. **Cost Tracking**: Show token/API usage per ticket
4. **Session Resume**: Resume dashboard state after restart
5. **Multiple Jira Instances**: Support multiple Jira cloud IDs
6. **Webhook Support**: Real-time Jira/GitHub updates via webhooks instead of polling
7. **Auto-merge**: Option to auto-merge PRs when all approvals received
8. **Metrics Dashboard**: Success rate, average completion time, etc.

---

## Related Projects

- [OpenTUI](https://github.com/anomalyco/opentui) - Terminal UI library
- [OpenCode](https://github.com/anomalyco/opencode) - AI coding agent
- [Atlassian MCP Server](https://github.com/atlassian/atlassian-mcp-server) - Jira/Confluence API via MCP
- [GitHub MCP Server](https://github.com/github/github-mcp-server) - GitHub API via MCP
