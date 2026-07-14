# Workhorse Architecture

An AI-powered agent orchestrator that manages coding agents working on Jira and GitHub issues.

## Tech Stack

| Category   | Choice                                                |
| ---------- | ----------------------------------------------------- |
| Runtime    | Bun                                                   |
| Language   | TypeScript (strict)                                   |
| Database   | SQLite via `@libsql/client` + `drizzle-orm`           |
| Testing    | Vitest (97% line/function, 95% branch coverage)       |
| Linting    | oxlint with custom plugin (`eslint-plugin-workhorse`) |
| Formatting | oxfmt                                                 |
| Monorepo   | Bun workspaces                                        |

## Project Structure

```
workhorse/
├── packages/
│   ├── core/              # @workhorse/core — main library
│   │   └── src/
│   │       ├── bootstrap.ts      # Main entry — creates Workhorse instance
│   │       ├── config/           # TOML config loading & validation
│   │       ├── context/          # Async context (useWorkhorse)
│   │       ├── db/               # SQLite schema, controllers
│   │       ├── lib/
│   │       │   ├── git/          # Git worktree operations
│   │       │   └── hooks/        # Event system (mitt)
│   │       ├── plugins/          # Plugin system & core tools
│   │       │   └── builtin/     # Core plugin (acknowledge, update_status, escalate)
│   │       ├── services/
│   │       │   ├── attachment/   # External attachment storage (images, files)
│   │       │   ├── memory/       # L1 (context.md) + L2 (semantic search) + notifications
│   │       │   └── monitor/      # Polling framework
│   │       └── workflow/
│   │           ├── orchestrator/ # Agent lifecycle, adapters, tools, model registry
│   │           ├── steering/    # Autonomous steering rules
│   │           └── tracker/     # Issue parsing, prompt building
│   ├── plugins/           # External plugins
│   │   ├── github/        # workhorse-plugin-github — PR monitoring, tools, status sync
│   │   ├── jira/          # workhorse-plugin-jira — comment monitoring, tools, transitions
│   │   ├── pi-adapter/    # workhorse-plugin-pi-adapter — Pi Coding Agent adapter
│   │   └── playwright/    # workhorse-plugin-playwright — browser automation
│   ├── tui/               # @workhorse/tui — Terminal UI (OpenTUI + Solid.js)
│   └── tui-worktrees/     # TUI worktree instances
├── oxlint/                # Custom lint rules
├── plan/                  # Build plan documentation
└── docs/                  # Architecture and plugin guides
```

## Key Concepts

### 1. Bootstrap (`bootstrap.ts`)

Creates a `Workhorse` instance — the main entry point:

```typescript
const jt = await bootstrap();
// Access: jt.config, jt.db, jt.hooks, jt.memory, jt.monitors, jt.tracker, jt.orchestrator, jt.plugins
await jt.shutdown();
```

Components initialized (in order):

1. **Hooks** — Global event emitter cleared and reset
2. **Config** — Loaded from TOML files (global → project cascade), with optional overrides
3. **Database** — SQLite with migrations, issues, events, notifications tables
4. **MemoryService** — L1 (context.md) + L2 (retriv) + NotificationService
5. **MonitorService** — Polling framework for external changes
6. **Tracker** — Issue parsing + prompt building with memory enrichment
7. **Orchestrator** — Agent lifecycle management with adapters and tools
8. **Plugins** — Core plugins first, then provided plugins, then discovered custom plugins

### 2. Context System (`context/`)

Uses `unctx` + `AsyncLocalStorage` for async context propagation:

```typescript
// Inside plugin setup or any code running in context
const { db, hooks, memory, config, monitors, tracker, orchestrator, paths } =
  useWorkhorse();

// Safe access (returns undefined if not in context)
const ctx = tryUseWorkhorse();

// Running code with context
runWithContext(context, async () => {
  // useWorkhorse() works here
});
```

### 3. Plugin System (`plugins/`)

Plugins extend Workhorse via `definePlugin()`:

```typescript
import { definePlugin, useWorkhorse } from "@workhorse/core";
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
  }),
  setup(config) {
    const { hooks, tracker, orchestrator, monitors } = useWorkhorse();
    // Register parsers, tools, monitors, steering rules, prompt hooks
  },
  teardown() {
    // Cleanup
  },
});
```

**Plugin Types:**

- **Integration plugins** — Connect to external services (Jira, GitHub)
- **Adapter plugins** — Register agent harnesses (Pi, Claude Code, Opencode)

**Plugin Capabilities:**

| Capability     | API                                       | Description                            |
| -------------- | ----------------------------------------- | -------------------------------------- |
| Issue Parsers  | `ctx.tracker.registerParser()`            | Parse ticket keys/URLs into issues     |
| Monitors       | `ctx.monitors.registerMonitor()`          | Poll external services for changes     |
| Tools          | `ctx.orchestrator.registerTool()`         | Add functions agents can invoke        |
| Adapters       | `ctx.orchestrator.registerAdapter()`      | Register agent harness implementations |
| Steering       | `ctx.orchestrator.registerSteeringRule()` | Add idle agent behavior rules          |
| Prompt Context | `ctx.hooks.on("prompt.building")`         | Inject context into agent prompts      |
| TUI Renderers  | `ctx.hooks.emit("tui.register_renderer")` | Register activity renderers            |

### 4. HarnessOrchestrator (`workflow/orchestrator/`)

Manages agent lifecycle with pluggable adapters:

```typescript
// Register an adapter (in plugin setup)
orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter);

// Register tools for agents
orchestrator.registerTool({
  name: "my_action",
  description: "Does something useful",
  schema: { type: "object", properties: { ... }, required: [...] },
  execute: async (args, ctx) => {
    return { success: true, output: "Done" };
  },
});

// Spawn an agent
const adapter = await orchestrator.spawn({
  issue,                    // Issue from DB
  repoPath: "/path/to/repo",
  baseBranch: "main",
  harness: "pi-coding-agent",
  model: "anthropic/claude-sonnet-4",
});
```

**AgentAdapter** — Abstract class for harness implementations:

- `create()` — Factory method: creates worktree, builds prompt, subscribes to hooks
- `start()` → `doStart()` — Begin agent execution (subclass override)
- `sendMessage()` — Send messages to running agent (subclass override)
- `stop()` → `doStop()` — Graceful shutdown, dispose steering rules (subclass override)

Each adapter subscribes to `notification.created` and `steering.reminder` hooks during initialization, handling its own message delivery rather than relying on the orchestrator.

**Model Registry** — Each adapter provides a `ModelRegistry` implementation that lists available models and providers.

### 5. Tracker (`workflow/tracker/`)

Parses user input and builds prompts:

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

**Components:**

- **Tracker** — Entry point, manages parsers, coordinates prompt building
- **IssueParser** — Parses ticket keys, URLs via plugin-registered parsers
- **PromptEngineer** — Builds prompts with L1/L2 memory context, notifications, and custom instructions

### 6. MemoryService (`services/memory/`)

Three-tier memory system:

**L1 Store** — Per-worktree session memory (`context.md` files):

```typescript
const ctx = memory.l1.get("AM-123");
if (ctx) {
  const session = await ctx.read();
  await ctx.appendSession(entry);
  await ctx.updatePatterns([...patterns]);
}
```

**L2 Store** — Semantic search via `retriv` (BM25 FTS5 + vector embeddings):

```typescript
await memory.l2.index([
  { id: "doc-1", content: "...", metadata: { type: "decision" } },
]);
const results = await memory.l2.search("authentication flow", { limit: 5 });
```

**NotificationService** — Push-based agent inbox:

```typescript
await memory.notifications.create({
  issueId,
  source: "jira",
  sourceId: "comment-456",
  title: "New comment",
  body: "Please review",
  priority: "high",
});
const unread = await memory.notifications.getUnread(issueId);
const inboxXml = memory.notifications.generateInbox(unread);
```

### 7. AttachmentService (`services/attachment/`)

Centralized storage for downloaded attachments from external sources (Jira, GitHub):

```typescript
import { AttachmentService } from "workhorse-core";

const attachmentService = new AttachmentService(paths.attachmentsDir);

// Store an attachment
const stored = await attachmentService.store(
  "owner/repo", // Repository identifier
  "issue-uuid", // Internal issue ID
  contentBuffer, // File content
  {
    source: "jira",
    sourceId: "att-123",
    filename: "screenshot.png",
    mimeType: "image/png",
    size: 12345,
  },
);

// Check if already downloaded (deduplication)
const existing = await attachmentService.exists(
  "owner/repo",
  "issue-uuid",
  "att-123",
);

// List all attachments for an issue
const attachments = await attachmentService.listForIssue(
  "owner/repo",
  "issue-uuid",
);
```

**Storage Location:** `~/.local/share/workhorse/attachments/{repo}/{issueId}/`

**Why outside repo?**

- Avoids polluting git history with binary files
- Consistent location regardless of worktree
- Cross-session persistence

See [`packages/core/src/services/attachment/README.md`](../packages/core/src/services/attachment/README.md) for details.

### 8. MonitorService (`services/monitor/`)

Polling framework for background tasks:

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

Monitors self-stop after 5 consecutive errors. Error count resets on successful poll.

**Rate Limit Handling:**

Monitors support pause-and-resume for rate limits via `onError` and `pauseMs`:

```typescript
import {
  createRateLimitChecker,
  withRetryAfterOrBackoff,
} from "workhorse-core";

const isRateLimitError = createRateLimitChecker([
  "429",
  "rate limit",
  "too many requests",
]);

monitors.registerMonitor({
  id: "api-poll",
  type: "remote",
  interval: 30000,
  poll: async (ctx) => {
    /* ... */
  },
  onError: (error, errorCount) => {
    if (isRateLimitError(error)) {
      // Dynamic pause using Retry-After header or exponential backoff
      const pauseMs = withRetryAfterOrBackoff()({ error, errorCount });
      return { pauseMs, reason: "Rate limited" };
    }
    // Return undefined to use default error handling
  },
});
```

**Pause strategies** (`workhorse-core`):

| Function                           | Description                                            |
| ---------------------------------- | ------------------------------------------------------ |
| `parseRetryAfter(headers)`         | Parse `Retry-After` / `x-ratelimit-reset` from Headers |
| `extractRetryAfter(error)`         | Read `error.retryAfterMs` property (set by API client) |
| `createRateLimitChecker(patterns)` | Factory for rate limit error detection                 |
| `exponentialBackoff(count)`        | Calculate backoff with jitter (0.7-1.3x)               |
| `withRetryAfterOrBackoff()`        | Try Retry-After first, fall back to backoff            |
| `fixedPause(ms)`                   | Simple fixed-duration pause                            |

**Monitor states:** `stopped` → `running` ↔ `paused` → `stopped`

Hooks emitted: `monitor.paused`, `monitor.resumed`

### 9. SteeringRule (`workflow/steering/`)

Autonomous rules for agent behavior when idle:

```typescript
orchestrator.registerSteeringRule({
  id: "review-reminder",
  name: "PR Review Reminder",
  description: "Reminds agents to check for PR reviews when idle",
  condition: {
    status: ["in_review"],
    hook: ["agent.idle"],
    when: async (ctx) => ctx.notifications.some((n) => n.source === "github"),
  },
  reminder: async (ctx) =>
    `You have ${ctx.notifications.length} pending reviews.`,
  once: false,
});
```

Each `SteeringRule` is fully autonomous:

- Subscribes to `agent.idle` and other hooks
- Tracks hook history and tool history
- Evaluates conditions (status, source, hook, custom `when()`)
- Emits `steering.reminder` hook when conditions are met
- Respects cooldown and once-only constraints
- Never reminds when issue is `blocked`

### 10. Hooks (`lib/hooks/`)

Event pub/sub via `mitt`:

```typescript
hooks.on("issue.status_changed", ({ issue, from, to }) => {
  /* ... */
});
hooks.emit("notification.created", { notification, issueId });
hooks.off("issue.status_changed", handler);
```

**Key Events:**

- Agent: `agent.create.pre`, `agent.create.post`, `agent.start.pre`, `agent.start.post`, `agent.stop.pre`, `agent.stop.post`, `agent.idle`, `agent.tool_call`
- Issue: `issue.parsed`, `issue.status_changed`, `issue.deleted`
- Prompt: `prompt.building`, `prompt.built`
- Monitor: `monitor.registered`, `monitor.tick`, `monitor.error`, `monitor.paused`, `monitor.resumed`
- Notification: `notification.created`
- Steering: `steering.reminder`
- Plugin: `plugin.loaded`, `plugin.error`

## Data Flow

```
User Input (ticket key/URL)
    │
    ▼
┌─────────┐
│ Tracker │ ← Plugin-registered parsers (Jira, GitHub, local)
└────┬────┘
     │ ParsedIssue → Issue (DB)
     ▼
┌──────────────┐
│PromptEngineer│ ← L1/L2 memory context + notifications + plugin context blocks
└──────┬───────┘
       │ HybridPrompt { systemPrompt, initialMessage }
       ▼
┌─────────────────┐
│HarnessOrchestrator│  registerAdapter(), registerTool(), registerSteeringRule()
└────────┬────────┘
         │ spawn() → AgentAdapter.create() → initialize() → start()
         ▼
┌─────────────┐
│ AgentAdapter │ ← Pi, Claude Code, etc. (each in its own worktree)
└──────┬──────┘
       │
       ├── Tool calls → OrchestratorTool.execute(args, ToolExecutionContext)
       │
       ├── Hook events → SteeringRules evaluate → steering.reminder → sendMessage()
       │
       └── MonitorService polls → notifications created → notification.created → sendMessage()
```

## Configuration

TOML config with cascading merge (defaults ← global ← project ← overrides):

```toml
[agent]
harness = "pi-agent"       # "pi-coding-agent" | "claude-code" | "opencode"
model = "claude-sonnet-4"

[behavior]
auto_resume = true
poll_interval = 30000       # ms

[prompt]
custom = """
Project-specific instructions.
"""

[steering]
enabled = true
debounce_ms = 2000
max_reminders = 3
cooldown_ms = 30000

[plugins]
disabled = []

[plugins.jira]
cloud_id = "company.atlassian.net"
poll_interval = 30000

[plugins.github]
poll_interval = 30000
```

**Config Locations:**

- Global: `~/.workhorse.toml`, `~/.config/workhorse.toml`, or `~/.config/workhorse/config.toml`
- Project: `<repo>/.workhorse.toml`

**Data Directory:** `~/.local/share/workhorse/` (respects `XDG_DATA_HOME`)

## Plugins

### workhorse-plugin-jira

Jira Cloud integration:

- Issue parsing for ticket keys (`PROJ-123`) and URLs
- Comment monitoring with deduplication
- Status sync (Workhorse → Jira transitions)
- Attachment handling (issue attachments + embedded comment media)
- Tools: `jira_add_comment`, `jira_transition_issue`, `jira_get_comments`, `jira_get_attachments`
- Cross-plugin sync with GitHub (PR merge → Jira transition)
- Steering rules for comment response

See [`packages/plugins/jira/README.md`](../packages/plugins/jira/README.md) for details.

### workhorse-plugin-github

GitHub integration via `gh` CLI:

- Issue/PR parsing for `owner/repo#45` and URLs
- Unified PR monitor (reviews, comments, CI checks, mergeable state)
- Status sync (Workhorse → GitHub labels)
- Tools: `github_open_pr`, `github_add_comment`, `github_get_pr_status`, `github_get_ci_check`, `github_get_pr_reviews`
- Steering rules for PR review and CI failure reminders
- Cross-plugin PR contribution system via `github:pr.opening` hook

See [`packages/plugins/github/README.md`](../packages/plugins/github/README.md) for details.

### workhorse-plugin-pi-adapter

Pi Coding Agent adapter:

- Wraps Pi SDK as `AgentAdapter` implementation
- Translates Workhorse tools to Pi extensions
- Enforces path restrictions (agents can only access their worktree)
- Model registry with Pi's authentication

See [`packages/plugins/pi-adapter/README.md`](../packages/plugins/pi-adapter/README.md) for details.

### workhorse-plugin-playwright

Browser automation:

- Tools: `playwright_navigate`, `playwright_screenshot`, `playwright_click`, `playwright_fill`, etc.
- Session management (one browser per issue, auto-cleanup)
- Screenshot contribution to PRs via `github:pr.opening` hook
- Steering rule to remind agents to capture screenshots

See [`packages/plugins/playwright/README.md`](../packages/plugins/playwright/README.md) for details.

## Database Schema

### issues

| Column        | Type        | Description                    |
| ------------- | ----------- | ------------------------------ |
| id            | text (PK)   | UUID                           |
| external_id   | text        | External ID (e.g., "PROJ-123") |
| source        | text        | Source system (e.g., "jira")   |
| title         | text        | Issue title                    |
| description   | text        | Issue body                     |
| status        | text        | Issue status                   |
| issue_type    | text        | Type (task, bug, story, etc.)  |
| url           | text        | Link to external issue         |
| assignee      | text        | Assigned user                  |
| labels        | text (json) | Label array                    |
| metadata      | text (json) | Source-specific data           |
| worktree_path | text        | Git worktree location          |
| created_at    | text        | Creation timestamp             |
| updated_at    | text        | Update timestamp               |

### notifications

| Column          | Type          | Description              |
| --------------- | ------------- | ------------------------ |
| id              | text (PK)     | UUID                     |
| issue_id        | text (FK)     | Associated issue         |
| source          | text          | Source system            |
| source_id       | text (unique) | Dedup key                |
| priority        | text          | blocking/high/normal/low |
| status          | text          | unread/read/acknowledged |
| title           | text          | Notification title       |
| body            | text          | Notification content     |
| metadata        | text (json)   | Additional data          |
| created_at      | text          | Creation timestamp       |
| read_at         | text          | Read timestamp           |
| acknowledged_at | text          | Acknowledged timestamp   |

### issue_events

| Column     | Type        | Description        |
| ---------- | ----------- | ------------------ |
| id         | text (PK)   | UUID               |
| issue_id   | text (FK)   | Associated issue   |
| type       | text        | Event type         |
| message    | text        | Event message      |
| metadata   | text (json) | Additional data    |
| created_at | text        | Creation timestamp |

## Built-in Agent Tools

| Tool                      | Description                            | Parameters                              |
| ------------------------- | -------------------------------------- | --------------------------------------- |
| `workhorse_acknowledge`   | Mark notification(s) as read           | `notificationIds?: string[]`            |
| `workhorse_update_status` | Update issue status                    | `status: string`                        |
| `workhorse_escalate`      | Escalate to a human                    | `message: string`, `blocking?: boolean` |
| `workhorse_preview_image` | View an image file (for vision models) | `path: string`                          |
