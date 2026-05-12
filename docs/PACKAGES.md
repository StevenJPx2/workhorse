# Jiratown Packages Documentation

This document provides extensive documentation for all packages in the Jiratown monorepo. Jiratown is an AI-powered agent orchestrator that manages coding agents working on Jira and GitHub issues.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Package Structure](#package-structure)
3. [@jiratown/core](#jiratowncore)
4. [@jiratown/plugin-jira](#jiratownplugin-jira)
5. [@jiratown/plugin-github](#jiratownplugin-github)
6. [@jiratown/plugin-playwright](#jiratownplugin-playwright)
7. [@jiratown/plugin-pi-adapter](#jiratownplugin-pi-adapter)
8. [@jiratown/tui](#jiratowntui)
9. [Cross-Package Communication](#cross-package-communication)
10. [Plugin Development Guide](#plugin-development-guide)

---

## Architecture Overview

Jiratown follows a modular plugin-based architecture where:

- **@jiratown/core** provides the foundational services (config, database, hooks, memory, monitoring, tracking, orchestration)
- **Plugins** extend functionality by registering parsers, tools, monitors, adapters, and steering rules
- **The TUI** provides the visual interface for orchestrating agents

```
┌─────────────────────────────────────────────────────────────────┐
│                        @jiratown/tui                            │
│              Terminal UI (OpenTUI + Solid.js)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       @jiratown/core                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  Config  │ │ Database │ │  Hooks   │ │   PluginRegistry │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐ │
│  │ MemoryService│ │MonitorService│ │   HarnessOrchestrator   │ │
│  └──────────────┘ └──────────────┘ └─────────────────────────┘ │
│  ┌────────────┐ ┌───────────────────────────────────────────┐  │
│  │  Tracker   │ │  Context System (AsyncLocalStorage)       │  │
│  └────────────┘ └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────────┐
│ plugin-jira   │   │ plugin-github │   │ plugin-pi-adapter     │
│ plugin-playwright│ │               │   │                       │
└───────────────┘   └───────────────┘   └───────────────────────┘
```

### Key Design Principles

1. **Plugin-Based Extension**: All external integrations (Jira, GitHub, Playwright) are plugins
2. **Source-Agnostic Tracking**: The Tracker doesn't know about specific sources; plugins register parsers
3. **Harness-Agnostic Orchestration**: The Orchestrator doesn't know about specific agents; adapters are registered by plugins
4. **Hook-Based Communication**: Components communicate via the event system, enabling loose coupling
5. **Context-Based Dependency Injection**: Services are accessed via async context (`useJiratown()`)

---

## Package Structure

```
packages/
├── core/                    # @jiratown/core — Main library
│   └── src/
│       ├── bootstrap.ts     # Entry point - creates Jiratown instance
│       ├── config/          # TOML config loading & validation
│       ├── context/         # Async context (useJiratown)
│       ├── db/              # SQLite via drizzle-orm
│       ├── lib/
│       │   ├── git/         # Git worktree operations
│       │   ├── hooks/       # Event system (mitt)
│       │   └── paths/       # Path resolution utilities
│       ├── plugins/         # Plugin system & builtin plugins
│       ├── services/
│       │   ├── memory/      # L1 (context.md) + L2 (semantic search)
│       │   └── monitor/     # Polling framework
│       └── workflow/
│           ├── orchestrator/# Agent lifecycle, adapters, tools
│           ├── steering/    # Autonomous steering rules
│           └── tracker/     # Issue parsing, prompt building
├── plugins/
│   ├── github/              # @jiratown/plugin-github
│   ├── jira/                # @jiratown/plugin-jira
│   ├── playwright/          # @jiratown/plugin-playwright
│   └── pi-adapter/          # @jiratown/plugin-pi-adapter
└── tui/                     # @jiratown/tui — Terminal UI
```

---

## @jiratown/core

The core package provides the foundational services and APIs for Jiratown.

### Installation

```bash
bun add @jiratown/core
```

### Quick Start

```typescript
import { bootstrap } from "@jiratown/core";

const jt = await bootstrap({ repoRoot: process.cwd() });

// Access services
jt.config;       // Loaded configuration
jt.paths;        // Resolved file paths
jt.db;           // SQLite database
jt.memory;       // L1 + L2 memory + notifications
jt.monitors;     // Polling framework
jt.hooks;        // Event pub/sub
jt.tracker;      // Issue parsing + prompt building
jt.orchestrator; // Agent lifecycle management
jt.plugins;      // Plugin registry

// Shutdown gracefully
await jt.shutdown();
```

### Module Documentation

#### 1. Bootstrap (`bootstrap.ts`)

Creates a complete Jiratown instance with all services initialized.

```typescript
import { bootstrap, type BootstrapOptions, type Jiratown } from "@jiratown/core";

const jt: Jiratown = await bootstrap({
  repoRoot: "/path/to/repo",       // Project root (default: cwd)
  plugins: [jiraPlugin, githubPlugin],  // Additional plugins
  overrides: {                      // Config overrides
    agent: { model: "claude-sonnet-4" },
  },
});
```

**Initialization Order:**
1. Hooks — Global event emitter cleared and reset
2. Config — Loaded from TOML files (global → project cascade)
3. Database — SQLite with migrations
4. MemoryService — L1 + L2 + NotificationService
5. MonitorService — Polling framework
6. Tracker — Issue parsing + prompt building
7. Orchestrator — Agent lifecycle management
8. Plugins — Core plugins first, then custom plugins

**Shutdown Order:**
```
orchestrator.shutdown()  →  Stop all agents
monitors.shutdown()      →  Stop all monitors
plugins.teardown()       →  Teardown plugins in reverse order
memory.shutdown()        →  Close L2 store
db.close()               →  Close database
hooks.all.clear()        →  Clear all event listeners
```

#### 2. Context System (`context/`)

Async-safe dependency injection using `unctx` + `AsyncLocalStorage`.

```typescript
import { useJiratown, tryUseJiratown, runWithContext } from "@jiratown/core";

// Inside plugin setup or any code running in context:
function myFunction() {
  const { config, hooks, db, memory, monitors, tracker, orchestrator, paths } = useJiratown();
}

// Safe access (returns undefined if not in context)
const ctx = tryUseJiratown();

// Run code with context
await runWithContext(context, async () => {
  // useJiratown() works here
});
```

**Testing Helpers:**
```typescript
import { setContext, unsetContext } from "@jiratown/core";

// Set singleton context for testing
setContext({ config, hooks });

// Clear after test
unsetContext();
```

#### 3. Configuration (`config/`)

TOML-based configuration with cascading merge and Zod validation.

**File Locations:**
- **Global** (first found wins):
  1. `~/.jiratown.toml`
  2. `~/.config/jiratown.toml`
  3. `~/.config/jiratown/config.toml`
- **Project**: `<repo>/.jiratown.toml`
- **Data directory**: `~/.local/share/jiratown/` (respects `XDG_DATA_HOME`)

**Config Schema:**
```toml
[agent]
harness = "pi-agent"            # Agent adapter to use
model = "claude-sonnet-4"       # Model override (optional)

[behavior]
auto_resume = true              # Auto-resume agents on restart
poll_interval = 30000           # Default monitor interval (ms)

[prompt]
custom = """                    # Custom instructions for agents
Project-specific instructions.
"""

[ui]
theme = "tokyonight"            # TUI theme

[steering]
enabled = true                  # Enable steering rules
debounce_ms = 2000              # Idle debounce before evaluation
max_reminders = 3               # Max reminders per rule
cooldown_ms = 30000             # Min time between reminders

[plugins]
disabled = []                   # Plugins to disable

[plugins.jira]
cloud_id = "company.atlassian.net"
poll_interval = 30000

[plugins.github]
poll_interval = 30000
```

**TypeScript Interface:**
```typescript
interface JiratownConfig {
  agent: {
    harness: string;
    model?: string;
  };
  behavior: {
    autoResume: boolean;
    pollInterval: number;
  };
  prompt: {
    custom?: string;
  };
  ui: {
    theme: string;
  };
  steering: {
    enabled: boolean;
    debounceMs: number;
    maxReminders: number;
    cooldownMs: number;
  };
  plugins: {
    disabled: string[];
    [pluginName: string]: unknown;
  };
}
```

**Credential Storage:**
```typescript
import { storeCredential, getCredential, deleteCredential } from "@jiratown/core";

await storeCredential("jiratown", "github_token", "ghp_xxx");
const token = await getCredential("jiratown", "github_token");
await deleteCredential("jiratown", "github_token");
```

#### 4. Database (`db/`)

SQLite via `@libsql/client` + `drizzle-orm`.

```typescript
import { Database } from "@jiratown/core";

const db = await Database.create(":memory:");

// Issues
const issue = await db.issues.insert({ externalId: "PROJ-123", source: "jira", ... });
await db.issues.getById(id);
await db.issues.getByExternalId("PROJ-123", "jira");
await db.issues.updateStatus(id, "in_progress");
await db.issues.getByStatus("pending");

// Events
await db.events.insert({ issueId, type: "comment", message: "..." });
await db.events.getForIssue(issueId);

// Notifications
await db.notifications.create({ issueId, source: "jira", title: "...", body: "..." });
await db.notifications.getUnread(issueId);
await db.notifications.markRead(id);

db.close();
```

**Tables:**

| Table | Description |
|-------|-------------|
| `issues` | Tracked issues from external sources |
| `issue_events` | Events/activity log for issues |
| `notifications` | Push notifications for agents |

#### 5. Hooks (`lib/hooks/`)

Event-based pub/sub via `mitt`.

```typescript
import { hooks } from "@jiratown/core";

// Subscribe
hooks.on("issue.parsed", ({ issue }) => console.log("Parsed:", issue.title));

// Emit
hooks.emit("issue.status_changed", { issue, from: "todo", to: "in_progress" });

// Unsubscribe
hooks.off("issue.parsed", handler);

// One-time listener
hooks.once("agent.started", handler);
```

**Built-in Events:**

| Event | Payload | When |
|-------|---------|------|
| `issue.parsed` | `{ issue, raw }` | Input parsed into an issue |
| `issue.status_changed` | `{ issue, from, to }` | Issue status updated |
| `issue.deleted` | `{ issue }` | Issue deleted from database |
| `prompt.building` | `{ issueId, context }` | Prompt being built |
| `prompt.built` | `{ issueId, prompt }` | Prompt finished building |
| `agent.create.pre` | `{ issue, options }` | Before adapter initialization |
| `agent.create.post` | `{ adapter }` | After adapter initialized |
| `agent.start.pre` | `{ adapter }` | Before agent starts |
| `agent.start.post` | `{ adapter }` | Agent started successfully |
| `agent.stop.pre` | `{ adapter }` | Before agent stops |
| `agent.stop.post` | `{ adapter }` | Agent stopped |
| `agent.idle` | `{ issueId }` | Agent becomes idle |
| `agent.tool_call` | `{ tool, args }` | Agent calls a tool |
| `notification.created` | `{ notification, issueId }` | Notification created |
| `monitor.registered` | `{ name, type }` | Monitor registered |
| `monitor.tick` | `{ id, issueId, result }` | Monitor detected changes |
| `monitor.error` | `{ id, issueId, error, errorCount }` | Monitor poll threw error |
| `steering.reminder` | `{ issueId, reminder }` | Steering rule fired |
| `plugin.loaded` | `{ name }` | Plugin registered |
| `plugin.error` | `{ name, error }` | Plugin setup failed |

#### 6. Plugin System (`plugins/`)

Plugins extend Jiratown via `definePlugin()`.

```typescript
import { definePlugin, useJiratown } from "@jiratown/core";
import { z } from "zod/v4";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
    capabilities: {
      parsers: ["my-service"],
      monitors: ["my-monitor"],
      tools: ["my_action"],
    },
  },
  configSchema: z.object({
    apiKey: z.string(),
    timeout: z.number().default(5000),
  }),
  setup(config) {
    const { hooks, tracker, orchestrator, monitors } = useJiratown();
    // Register parsers, tools, monitors, steering rules
  },
  teardown() {
    // Cleanup
  },
});
```

**Plugin Capabilities:**

| Capability | API | Description |
|-----------|-----|-------------|
| Issue Parsers | `tracker.registerParser()` | Parse ticket keys/URLs into issues |
| Monitors | `monitors.registerMonitor()` | Poll external services for changes |
| Tools | `orchestrator.registerTool()` | Add functions agents can invoke |
| Adapters | `orchestrator.registerAdapter()` | Register agent harness implementations |
| Steering | `orchestrator.registerSteeringRule()` | Add idle agent behavior rules |
| Prompt Context | `hooks.on("prompt.building")` | Inject context into agent prompts |
| TUI Renderers | `hooks.emit("tui.register_renderer")` | Register activity renderers |

#### 7. Memory Service (`services/memory/`)

Three-tier memory system for agent context.

**L1 Store — Session Memory:**
```typescript
const ctx = memory.l1.get("AM-123");
if (ctx) {
  const session = await ctx.read();
  await ctx.appendSession({ timestamp: new Date(), status: "implementing", ... });
  await ctx.updatePatterns([...patterns]);
}
```

**L2 Store — Semantic Search:**
```typescript
await memory.l2.index([{ id: "doc-1", content: "...", metadata: { type: "decision" } }]);
const results = await memory.l2.search("authentication flow", { limit: 5 });
```

**NotificationService:**
```typescript
await memory.notifications.create({
  issueId, source: "jira", sourceId: "comment-456",
  title: "New comment", body: "Please review", priority: "high",
});
const unread = await memory.notifications.getUnread(issueId);
const inboxXml = memory.notifications.generateInbox(unread);
```

#### 8. Monitor Service (`services/monitor/`)

Polling framework for background tasks.

```typescript
// Register a monitor (once at plugin setup)
monitors.registerMonitor({
  id: "jira-comments",
  type: "remote",
  interval: 30000,
  poll: async (ctx) => {
    const comments = await fetchNewComments(ctx.issueId);
    return { hasChanges: comments.length > 0, data: comments };
  },
});

// Start monitoring for a specific issue
monitors.startMonitor("jira-comments", issueId);

// Stop
monitors.stopMonitor("jira-comments", issueId);
monitors.stopMonitors(issueId);
```

Monitors self-stop after 5 consecutive errors.

#### 9. Tracker (`workflow/tracker/`)

Parses user input and builds prompts.

```typescript
// Register a parser (in plugin setup)
tracker.registerParser({
  source: "jira",
  canParse: (input) => /^[A-Z]+-\d+$/.test(input),
  parse: async (input) => fetchJiraIssue(input),
});

// Parse input
const issue = await tracker.parseInput("AM-123");

// Build prompt for the issue
const prompt = await tracker.buildPrompt(issue.id);
```

#### 10. Orchestrator (`workflow/orchestrator/`)

Agent lifecycle management with pluggable adapters.

```typescript
// Register an adapter (in plugin setup)
orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter);

// Register tools
orchestrator.registerTool({
  name: "my_action",
  description: "Does something useful",
  schema: { type: "object", properties: { ... }, required: [...] },
  execute: async (args, ctx) => ({ success: true, output: "Done" }),
});

// Register steering rules
orchestrator.registerSteeringRule({
  id: "review-reminder",
  name: "PR Review Reminder",
  condition: { status: ["in_review"], hook: ["agent.idle"] },
  reminder: "Check for PR review feedback.",
});

// Spawn an agent
const adapter = await orchestrator.spawn({
  issue,
  repoPath: "/path/to/repo",
  harness: "pi-coding-agent",
  model: "anthropic/claude-sonnet-4",
});

await adapter.start();
```

#### 11. Steering (`workflow/steering/`)

Autonomous rules for idle agent guidance.

```typescript
orchestrator.registerSteeringRule({
  id: "blocked-check",
  name: "Blocked Agent Check",
  description: "Reminds blocked agents to check notifications",
  condition: {
    status: ["blocked"],
    hook: ["agent.idle"],
    when: async (ctx) => ctx.notifications.length > 0,
  },
  reminder: async (ctx) => `You have ${ctx.notifications.length} unread notifications.`,
  once: true,
});
```

**Condition Filters:**
- `status` — Only evaluate when issue status is in this list
- `source` — Only evaluate when issue source is in this list
- `hook` — At least one of these hooks must have fired
- `when` — Custom async condition function

**Evaluation Rules:**
- Never reminds when issue status is `"blocked"`
- Respects cooldown (default: 30s between reminders)
- `once: true` only fires once per agent session

#### 12. Built-in Tools

The core plugin registers three tools available to all agents:

| Tool | Description | Parameters |
|------|-------------|-----------|
| `jiratown_acknowledge` | Mark notification(s) as read | `notificationIds?: string[]` |
| `jiratown_update_status` | Update issue status | `status: string` |
| `jiratown_escalate` | Escalate to a human | `message: string`, `blocking?: boolean` |

#### 13. Git Worktree Operations

```typescript
import { createWorktree, removeWorktree } from "@jiratown/core";

const worktree = await createWorktree("/path/to/repo", "PROJ-123", "task", "main");
console.log(worktree.path);    // "/path/to/repo-worktrees/PROJ-123"
console.log(worktree.branch);  // "task/PROJ-123"

await removeWorktree("/path/to/repo", "PROJ-123", true);  // delete branch too
```

---

## @jiratown/plugin-jira

Jira Cloud integration plugin for Jiratown.

### Installation

```bash
bun add @jiratown/plugin-jira
```

### Features

| Feature | Description |
|---------|-------------|
| **Issue Parsing** | Parse Jira ticket keys (`PROJ-123`) and URLs |
| **Comment Monitor** | Poll for new comments and update notifications |
| **Prompt Enrichment** | Inject Jira issue state into agent prompts |
| **Status Sync** | Sync Jiratown status → Jira workflow transitions |
| **Tools** | `jira_add_comment`, `jira_transition_issue`, `jira_get_comments` |
| **Steering** | Idle agent reminders for unread comments |
| **Cross-plugin Sync** | React to GitHub PR events |

### Configuration

```toml
[plugins.jira]
cloud_id = "company.atlassian.net"    # Required
poll_interval = 30000                  # Comment poll interval in ms
```

### Usage

```typescript
import { jiraPlugin } from "@jiratown/plugin-jira";

const jt = await bootstrap({
  plugins: [jiraPlugin],
});
```

### Tools

#### jira_add_comment

```typescript
{
  ticketKey: "PROJ-123",
  body: "I've pushed the changes. Please review.",
  replyToId: "comment-456"    // Optional
}
```

#### jira_transition_issue

```typescript
{
  ticketKey: "PROJ-123",
  status: "In Progress"
}
```

#### jira_get_comments

```typescript
{
  ticketKey: "PROJ-123"
}
```

### Client API

```typescript
import { AtlassianClient } from "@jiratown/plugin-jira";

const client = new AtlassianClient("company.atlassian.net", credentialGetter);

const issue = await client.fetchIssue("PROJ-123");
await client.addComment("PROJ-123", "Working on this now.");
const transitions = await client.getTransitions("PROJ-123");
await client.transitionIssue("PROJ-123", "31");
```

---

## @jiratown/plugin-github

GitHub integration plugin via `gh` CLI.

### Installation

```bash
bun add @jiratown/plugin-github
```

### Features

| Feature | Description |
|---------|-------------|
| **Issue/PR Parsing** | Parse `owner/repo#45` and URLs |
| **Unified PR Monitor** | Reviews, comments, CI checks, mergeable state |
| **Status Sync** | Sync Jiratown status → GitHub labels |
| **Tools** | `github_open_pr`, `github_add_comment`, `github_get_pr_status` |
| **Steering** | PR review and CI failure reminders |

### Configuration

```toml
[plugins.github]
poll_interval = 30000
```

### Tools

#### github_open_pr

```typescript
{
  title: "feat: Add user authentication",
  base: "main",
  body: "## Summary\nAdded OAuth2 support",
  draft: false
}
```

#### github_add_comment

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  number: 42,
  body: "LGTM! 🚀"
}
```

#### github_get_pr_status

```typescript
{
  owner: "octocat",
  repo: "hello-world",
  number: 42
}
```

### Cross-Plugin Coordination

The `github:pr.opening` hook allows plugins to contribute sections to PR descriptions:

```typescript
ctx.hooks.on("github:pr.opening", async (event: unknown) => {
  const openingCtx = event as PROpeningContext;
  
  openingCtx.contributions.push({
    section: "My Section",
    content: formatMyContent(data),
    priority: 30,
  });
});
```

---

## @jiratown/plugin-playwright

Browser automation plugin using Playwright.

### Installation

```bash
bun add @jiratown/plugin-playwright
```

### Features

| Feature | Description |
|---------|-------------|
| **Session Management** | One browser per issue, auto-cleanup |
| **Navigation** | Load URLs, wait for network idle |
| **Screenshots** | Full page or element capture |
| **DOM Interaction** | Click, fill forms, query elements |
| **JavaScript Evaluation** | Execute JS in page context |
| **Cross-Plugin Sync** | Auto-add Screenshots to GitHub PRs |
| **Steering** | Remind to capture screenshots before PR |

### Configuration

```toml
[plugins.playwright]
browser_type = "chromium"
viewport_width = 1280
viewport_height = 720
timeout = 30000
headless = true
```

### Tools

| Tool | Description |
|------|-------------|
| `playwright_navigate` | Navigate to URL |
| `playwright_screenshot` | Capture screenshot |
| `playwright_click` | Click element |
| `playwright_fill` | Fill form input |
| `playwright_get_element` | Query element properties |
| `playwright_get_page_content` | Get page HTML/state |
| `playwright_evaluate` | Execute JavaScript |
| `playwright_close_session` | Close browser session |

### Hooks

The plugin emits these hooks:

| Hook | When |
|------|------|
| `playwright:session.started` | Browser session created |
| `playwright:session.closed` | Browser session closed |
| `playwright:page.loading` | Before page navigation (inject init scripts) |
| `playwright:page.navigated` | Page navigation completed |
| `playwright:screenshot.taken` | Screenshot captured |

---

## @jiratown/plugin-pi-adapter

Pi Coding Agent adapter plugin.

### Installation

```bash
bun add @jiratown/plugin-pi-adapter
```

### Features

| Feature | Description |
|---------|-------------|
| **Agent Adapter** | Full Pi SDK integration |
| **Model Registry** | Exposes Pi's available models |
| **Tool Extensions** | Translates Jiratown tools to Pi Extension API |
| **Event Handling** | Maps Pi session events to Jiratown hooks |
| **Streaming Support** | Send messages during streaming via `session.steer()` |

### Usage

```typescript
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";

const jt = await bootstrap({
  plugins: [piAdapterPlugin],
});

const adapter = await orchestrator.spawn({
  issue,
  repoPath: "/path/to/repo",
  harness: "pi-coding-agent",
  model: "anthropic/claude-sonnet-4",
});

await adapter.start();
```

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     PiAgentAdapter                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐    │
│  │ Pi SDK      │  │ Extensions   │  │ Event       │    │
│  │ Session     │  │ (Tools)      │  │ Handler     │    │
│  └─────────────┘  └──────────────┘  └─────────────┘    │
│  Inherits: AgentAdapter (worktree, prompt, steering)   │
└─────────────────────────────────────────────────────────┘
```

---

## @jiratown/tui

Terminal User Interface built with OpenTUI + Solid.js.

### Features

- **Multi-ticket dashboard**: Work on multiple issues simultaneously
- **Real-time progress**: Stream agent activity with live updates
- **Non-blocking notifications**: Know when agents are blocked
- **Keyboard-driven**: Efficient keyboard navigation

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` / `n` | Add new ticket |
| `Tab` | Switch between tickets |
| `e` | Escalate to Jira |
| `a` | Switch agent |
| `j` | Open ticket in Jira |
| `p` | View PR in browser |
| `x` | Close ticket tab |
| `r` | Resume blocked agent |
| `?` | Help |
| `q` | Quit |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    @jiratown/tui                        │
│  ┌────────────────┐  ┌────────────────────────────┐    │
│  │ TicketSidebar  │  │       TicketPane           │    │
│  │ - Issue list   │  │ - Agent progress           │    │
│  │ - Status icons │  │ - PR review workflow       │    │
│  │ - Navigation   │  │ - Blocked state view       │    │
│  └────────────────┘  └────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Notification Bar                    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Testing

Headless terminal testing via `ht` (headless-terminal):

```bash
# Run all tests
./packages/tui/scripts/test-headless.sh

# Run specific test
./packages/tui/scripts/test-headless.sh spawn
```

---

## Cross-Package Communication

### Hook-Based Communication

Plugins communicate via hooks:

```typescript
// Plugin A: Emit custom events
hooks.emit("my-plugin:data_ready", { data: myData });

// Plugin B: Listen to Plugin A
hooks.on("my-plugin:data_ready", ({ data }) => {
  // Use data from Plugin A
});
```

### PR Enhancement Pattern

The `github:pr.opening` hook enables coordination for PR descriptions:

```typescript
// Jira plugin contributes "Related Tickets"
ctx.hooks.on("github:pr.opening", async (event: unknown) => {
  const openingCtx = event as PROpeningContext;
  openingCtx.contributions.push({
    section: "Related Tickets",
    content: formatJiraTickets(openingCtx.issueId),
    priority: 10,
  });
});

// Playwright plugin contributes "Screenshots"
ctx.hooks.on("github:pr.opening", async (event: unknown) => {
  const openingCtx = event as PROpeningContext;
  openingCtx.contributions.push({
    section: "Screenshots",
    content: listScreenshots(openingCtx.worktreePath),
    priority: 80,
  });
});
```

### Post-Event Hooks

```typescript
// Jira listens for GitHub events
hooks.on("github:pr.created", async ({ issueId, pr }) => {
  await client.addComment(issueId, `PR opened: ${pr.url}`);
});

hooks.on("github:pr.merged", async ({ issueId, pr }) => {
  await client.addComment(issueId, `PR merged: ${pr.url}`);
  await client.transitionIssue(issueId, "Done");
});
```

---

## Plugin Development Guide

### 1. Create Plugin Structure

```
packages/plugins/my-plugin/
├── package.json
├── src/
│   ├── index.ts        # Plugin definition
│   ├── tools.ts        # Tool implementations
│   ├── monitor.ts      # Monitor factory
│   ├── steering.ts     # Steering rules
│   ├── prompt.ts       # Prompt enrichment
│   └── types.ts        # Type definitions
└── README.md
```

### 2. Define the Plugin

```typescript
// src/index.ts
import { definePlugin, useJiratown } from "@jiratown/core";
import { z } from "zod/v4";
import { myTool } from "./tools";
import { myMonitor } from "./monitor";
import { mySteeringRule } from "./steering";

export const MyConfigSchema = z.object({
  apiKey: z.string(),
  timeout: z.number().default(5000),
});

export type MyConfig = z.infer<typeof MyConfigSchema>;

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
    capabilities: {
      tools: ["my_action"],
      monitors: ["my-monitor"],
    },
  },
  configSchema: MyConfigSchema,

  setup(config) {
    const { hooks, tracker, orchestrator, monitors } = useJiratown();

    // Register tool
    orchestrator.registerTool(myTool);

    // Register monitor
    monitors.registerMonitor(myMonitor(config));

    // Register steering rule
    orchestrator.registerSteeringRule(mySteeringRule);

    // Add prompt context
    hooks.on("prompt.building", ({ issueId, context }) => {
      context.contextBlocks.push({
        id: "my-context",
        title: "My Plugin Context",
        content: "Additional information...",
        priority: 50,
      });
    });

    // Start monitor when agent spawns
    hooks.on("agent.create.post", ({ adapter }) => {
      monitors.startMonitor("my-monitor", adapter.issueId);
    });

    // Stop monitor when agent stops
    hooks.on("agent.stop.post", ({ adapter }) => {
      monitors.stopMonitor("my-monitor", adapter.issueId);
    });
  },

  teardown() {
    // Cleanup
  },
});
```

### 3. Implement Tools

```typescript
// src/tools.ts
import type { OrchestratorTool, ToolResult } from "@jiratown/core";

export const myTool: OrchestratorTool = {
  name: "my_action",
  description: "Performs a custom action",
  schema: {
    type: "object",
    properties: {
      param: { type: "string", description: "Action parameter" },
    },
    required: ["param"],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const { param } = args as { param: string };

    try {
      // Do work
      return { success: true, output: `Action completed: ${param}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
```

### 4. Implement Monitor

```typescript
// src/monitor.ts
import type { MonitorOptions } from "@jiratown/core";
import type { MyConfig } from "./index";

export function myMonitor(config: MyConfig): MonitorOptions {
  return {
    id: "my-monitor",
    type: "remote",
    interval: config.timeout,
    async poll(ctx) {
      const updates = await fetchUpdates(ctx.issueId);
      return {
        hasChanges: updates.length > 0,
        data: updates,
      };
    },
  };
}
```

### 5. Implement Steering Rule

```typescript
// src/steering.ts
import type { SteeringRuleConfig } from "@jiratown/core";

export const mySteeringRule: SteeringRuleConfig = {
  id: "my-reminder",
  name: "My Reminder",
  description: "Reminds agents about something",
  condition: {
    status: ["implementing"],
    hook: ["agent.idle"],
    when: async (ctx) => {
      return ctx.notifications.some(n => n.source === "my-plugin");
    },
  },
  reminder: async (ctx) => {
    const notifs = ctx.notifications.filter(n => n.source === "my-plugin");
    return `You have ${notifs.length} notification(s) from My Plugin.`;
  },
  priority: 10,
  once: false,
};
```

### 6. Register Plugin

```typescript
import myPlugin from "@jiratown/plugin-my-plugin";

const jt = await bootstrap({
  plugins: [myPlugin],
});
```

### 7. Configure Plugin

```toml
# .jiratown.toml
[plugins.my-plugin]
api_key = "secret"
timeout = 10000
```

---

## Appendix: Complete API Reference

### Core Exports

| Export | Description |
|--------|-------------|
| `bootstrap(options)` | Initialize Jiratown instance |
| `useJiratown()` | Get current context (throws if not in context) |
| `tryUseJiratown()` | Get context or `undefined` |
| `runWithContext(ctx, fn)` | Execute function with context |
| `definePlugin(options)` | Create a plugin |
| `Database` | Database class |
| `MemoryService` | Memory service class |
| `MonitorService` | Monitor service class |
| `HarnessOrchestrator` | Orchestrator class |
| `AgentAdapter` | Abstract adapter base class |
| `ModelRegistry` | Abstract model registry base class |
| `SteeringRule` | Autonomous steering rule class |
| `Tracker` | Issue parsing and prompt building |
| `hooks` | Global hook emitter instance |
| `createWorktree` | Create git worktree |
| `removeWorktree` | Remove git worktree |

### Type Exports

| Type | Description |
|------|-------------|
| `Jiratown` | Bootstrap result interface |
| `BootstrapOptions` | Bootstrap configuration |
| `JiratownConfig` | Full config interface |
| `ConfigPaths` | Resolved paths |
| `Plugin` | Plugin type |
| `PluginManifest` | Plugin manifest |
| `OrchestratorTool` | Tool definition |
| `ToolExecutionContext` | Tool context |
| `ToolResult` | Tool result |
| `AgentState` | Agent state enum |
| `ModelInfo` | Model information |
| `SteeringRuleConfig` | Steering rule config |
| `SteeringCondition` | Steering condition |
| `SteeringContext` | Steering context |
| `MonitorOptions` | Monitor definition |
| `MonitorContext` | Monitor context |
| `MonitorResult` | Monitor result |
| `IssueParserOptions` | Parser options |
| `ParsedIssue` | Parsed issue |
| `SessionMemory` | L1 session memory |
| `MemoryDocument` | L2 document |
| `SearchResult` | L2 search result |
| `CreateNotificationInput` | Notification input |
| `HookEventMap` | All hook events |
| `PromptContextBlock` | Prompt context block |
