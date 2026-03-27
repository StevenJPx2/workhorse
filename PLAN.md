# Jiratown

> A terminal UI dashboard for orchestrating multiple AI coding agents working on Jira tickets simultaneously.

## Overview

**Jiratown** is a TUI application (built with OpenTUI + Solid.js) that enables developers to:

1. Open multiple Jira tickets as "tabs" in a terminal dashboard
2. Spawn AI coding agents (OpenCode or Claude Code) to work on each ticket
3. Monitor real-time progress across all agents
4. Keep Jira in sync with agent progress (comments, status transitions, PR links)
5. Handle blocked states with non-blocking notifications

Powered by [Gas Town](https://github.com/steveyegge/gastown) for multi-agent orchestration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Jiratown (OpenTUI + Solid.js)                │
│  - Manages MCP client for Jira API                              │
│  - SQLite for ticket state                                      │
│  - Streams Gas Town events for real-time updates                │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Polecat  │   │ Polecat  │   │ Polecat  │
        │ OpenCode │   │ Claude   │   │ OpenCode │
        │ AM-123   │   │ AM-456   │   │ AR-789   │
        └──────────┘   └──────────┘   └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    ┌──────────────────┐
                    │    Gas Town      │
                    │  (Orchestration) │
                    └──────────────────┘
```

### Core Components

| Component         | Technology             | Purpose                                    |
| ----------------- | ---------------------- | ------------------------------------------ |
| **UI**            | OpenTUI + Solid.js     | Terminal user interface                    |
| **Storage**       | SQLite                 | Ticket state and events                    |
| **Config**        | TOML                   | User preferences, Jira cloud ID            |
| **CLI**           | citty + @clack/prompts | CLI framework and interactive prompts      |
| **Jira API**      | Atlassian MCP          | Fetch tickets, post comments, transitions  |
| **Orchestration** | Gas Town               | Multi-agent coordination, worktrees, beads |
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
│   6. Dashboard creates Bead from Jira ticket                            │
│      bd create "AM-123: Fix auth timeout" --labels jira:AM-123          │
│                              │                                           │
│                              ▼                                           │
│   7. Dashboard spawns Gas Town polecat                                  │
│      gt sling bd-xyz123 <rig> --agent opencode                          │
│                              │                                           │
│                              ▼                                           │
│   8. Gas Town creates worktree, starts agent session                    │
│                              │                                           │
│                              ▼                                           │
│   9. Dashboard streams agent events via `gt feed --json`                │
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
                           │ Fetch Jira + Create Bead
                           ▼
                    ┌─────────────┐
                    │   QUEUED    │ (Bead created, waiting for agent)
                    └──────┬──────┘
                           │ gt sling (spawn polecat)
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

  -- Gas Town integration
  bead_id TEXT,                     -- "bd-a1b2c3"
  rig TEXT NOT NULL,                -- Git remote URL (e.g., "github.com/user/repo")
  worktree_path TEXT,

  -- Agent config
  agent TEXT DEFAULT 'opencode',    -- opencode|claude
  polecat_id TEXT,

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
│                                                                             │
│  [+] New   │ AM-123 │ AM-456 │ AM-789                                       │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AM-123: Fix authentication timeout bug                                     │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Status    IMPLEMENTING          Agent     opencode                         │
│  Phase     GREEN (5/5 passing)   Rig       myproject                        │
│  Worktree  ../myproject-worktrees/AM-123                                    │
│                                                                             │
│  ┌─ Progress ─────────────────────────────────────────────────────────────┐ │
│  │ ✓ Fetched Jira ticket                                                  │ │
│  │ ✓ Created bead bd-x7k2m                                                │ │
│  │ ✓ Planning complete                                                    │ │
│  │ ✓ Tests written (5 cases)                                              │ │
│  │ ✓ All tests passing                                                    │ │
│  │ ▶ Creating PR...                                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ Files Modified ───────────────────────────────────────────────────────┐ │
│  │  M src/auth/timeout.ts                    +45 -12                      │ │
│  │  A src/auth/__tests__/timeout.test.ts     +78                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [e] escalate   [a] switch agent   [j] open jira   [p] view pr   [x] close │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ ● AM-456 blocked - questions posted to Jira (3m ago)                        │
╰─────────────────────────────────────────────────────────────────────────────╯
```

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
| **Create Bead**     | `bd create`                             | Create Gas Town work item |
| **Spawn Agent**     | `gt sling <bead> <rig>`                 | Start polecat on work     |
| **Stream Events**   | `gt feed --json`                        | Real-time agent status    |
| **Agent Status**    | `gt agents --json`                      | List active agents        |
| **Update Jira**     | Atlassian MCP `addCommentToJiraIssue`   | Post progress             |
| **Transition Jira** | Atlassian MCP `transitionJiraIssue`     | Change status             |
| **Escalate**        | `gt escalate` + Jira comment            | Ask questions             |
| **Done**            | `gt done`                               | Agent signals completion  |
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

```
jiratown/
├── package.json
├── tsconfig.json
├── bunfig.toml                     # Solid.js preload config
├── build.ts                        # Bun build script
│
├── src/
│   ├── index.ts                    # CLI entry point (citty)
│   │
│   ├── commands/
│   │   ├── setup.ts                # `jiratown setup` (uses @clack/prompts)
│   │   ├── add.ts                  # `jiratown add <ticket>`
│   │   └── dashboard.ts            # `jiratown` (default - launches TUI)
│   │
│   ├── app/
│   │   ├── App.tsx                 # Root component
│   │   ├── Layout.tsx              # Shell with header/footer
│   │   ├── store.ts                # Solid.js store for app state
│   │   └── context.tsx             # App context providers
│   │
│   ├── components/
│   │   ├── TabBar.tsx              # Ticket tabs
│   │   ├── TicketPane.tsx          # Main ticket view
│   │   ├── TicketInput.tsx         # New ticket modal
│   │   ├── AgentStatus.tsx         # Status + phase badge
│   │   ├── ProgressLog.tsx         # Step-by-step progress
│   │   ├── FileChanges.tsx         # Modified files list
│   │   ├── Notifications.tsx       # Bottom notification bar
│   │   ├── BlockedView.tsx         # Blocked state UI
│   │   ├── PRReviewView.tsx        # PR review comments UI
│   │   ├── ReviewCommentCard.tsx   # Individual review comment + draft reply
│   │   └── AgentSelector.tsx       # Agent toggle
│   │
│   ├── hooks/
│   │   ├── useGasTown.ts           # gt CLI wrapper
│   │   ├── useBeads.ts             # bd CLI wrapper
│   │   ├── useJira.ts              # Atlassian MCP calls
│   │   ├── useGitHub.ts            # GitHub MCP calls
│   │   ├── useAgentFeed.ts         # Stream gt feed events
│   │   ├── useDatabase.ts          # SQLite CRUD
│   │   └── useConfig.ts            # Config file R/W
│   │
│   ├── lib/
│   │   ├── db.ts                   # SQLite init + migrations
│   │   ├── config.ts               # TOML parsing + config merging (global + project)
│   │   ├── atlassian.ts            # MCP client for Jira
│   │   ├── github.ts               # MCP client for GitHub
│   │   ├── jira-sync.ts            # Jira ↔ Beads bidirectional sync
│   │   ├── spawn.ts                # Bun.spawn helpers
│   │   ├── parse-ticket.ts         # Parse AM-123 or URL
│   │   └── detect-rig.ts           # Detect rig from git remote URL
│   │
│   └── types/
│       ├── index.ts
│       ├── ticket.ts
│       ├── config.ts
│       ├── github.ts               # GitHub types (PR, Review, Comment)
│       └── gastown.ts              # Gas Town event types
│
└── README.md
```

---

## Implementation Phases

### Phase 1: Foundation (4-5 days)

- [x] Project scaffolding with OpenTUI + Solid.js
- [x] CLI entry point with citty
- [x] `jiratown setup` command (using @clack/prompts)
  - [x] Check for Gas Town, Beads, Atlassian MCP, GitHub MCP
  - [x] Offer to install missing dependencies
  - [x] Collect Jira cloud ID
  - [x] Configure default agent
- [x] Config file parsing/writing (TOML)
  - [x] Global config (`~/.jiratown/config.toml`)
  - [x] Project config (`.jiratown.toml` in git root)
  - [x] Config merging (project overrides global)
- [x] SQLite database setup with migrations
- [x] Git rig detection from remote URL
- [x] Basic TUI shell (Layout, TabBar)

### Phase 2: Ticket Management (4-5 days)

- [ ] Atlassian MCP client implementation
  - [ ] Connect via `mcp-remote` proxy to `https://mcp.atlassian.com/v1/mcp`
  - [ ] Handle OAuth 2.1 authentication flow
  - [ ] `getJiraIssue` wrapper
  - [ ] `addCommentToJiraIssue` wrapper
  - [ ] `transitionJiraIssue` wrapper
- [ ] Ticket input modal (TicketInput component)
- [ ] SQLite CRUD for tickets
- [ ] TicketPane with basic info display

### Phase 3: Gas Town Integration (4-5 days)

- [ ] `useGasTown` hook
  - [ ] `gt sling` (spawn polecat)
  - [ ] `gt agents --json` (list agents)
  - [ ] `gt escalate` (post questions)
  - [ ] `gt done` (mark complete)
- [ ] `useBeads` hook
  - [ ] `bd create` (create bead from Jira ticket)
  - [ ] `bd update` (update status)
  - [ ] `bd show` (get bead details)
- [ ] Agent status polling
- [ ] `useAgentFeed` hook (stream `gt feed --json`)
- [ ] Real-time UI updates from feed events

### Phase 4: Progress & Sync (3-4 days)

- [ ] ProgressLog component (step-by-step display)
- [ ] FileChanges component (modified files)
- [ ] Jira sync: post progress comments
- [ ] Jira sync: transition status on phase changes
- [ ] Jira sync: link PRs when created
- [ ] Event logging to SQLite

### Phase 5: PR Review & Iteration (3-4 days)

- [ ] GitHub MCP client implementation (`src/lib/github.ts`)
  - [ ] Connect via `mcp-remote` proxy to `https://api.githubcopilot.com/mcp/`
  - [ ] Handle OAuth authentication flow
  - [ ] `get_pull_request` wrapper
  - [ ] `list_pull_requests` wrapper
  - [ ] `create_pull_request_review` wrapper
- [ ] `useGitHub` hook (`src/hooks/useGitHub.ts`)
- [ ] PR review polling (detect new comments/change requests)
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
│  ✓ Gas Town (gt) v0.12.1
│  ✓ Beads (bd) v0.62.0
│  ✗ Atlassian MCP not found
│
◆  Install Atlassian MCP?
│  ● Yes / ○ No
│
◇  Installing atlassian-mcp-server...
│  ✓ Atlassian MCP installed
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

1. **Gas Town Mayor Integration**: Let the Mayor orchestrate instead of direct polecat spawning
2. **Convoy Support**: Bundle multiple tickets into a Gas Town convoy
3. **Cost Tracking**: Show token/API usage per ticket
4. **Session Resume**: Resume dashboard state after restart
5. **Multiple Jira Instances**: Support multiple Jira cloud IDs
6. **Webhook Support**: Real-time Jira/GitHub updates via webhooks instead of polling
7. **Auto-merge**: Option to auto-merge PRs when all approvals received
8. **Metrics Dashboard**: Success rate, average completion time, etc.

---

## Related Projects

- [Gas Town](https://github.com/steveyegge/gastown) - Multi-agent workspace manager
- [Beads](https://github.com/steveyegge/beads) - Git-backed issue tracker for agents
- [OpenTUI](https://github.com/anomalyco/opentui) - Terminal UI library
- [OpenCode](https://github.com/anomalyco/opencode) - AI coding agent
- [Atlassian MCP Server](https://github.com/atlassian/atlassian-mcp-server) - Jira/Confluence API via MCP
- [GitHub MCP Server](https://github.com/github/github-mcp-server) - GitHub API via MCP
