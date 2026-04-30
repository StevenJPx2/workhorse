# Jiratown Architecture

An AI-powered agent orchestrator that manages coding agents working on Jira and GitHub issues.

## Tech Stack

| Category | Choice |
|----------|--------|
| Runtime | Bun |
| Language | TypeScript (strict) |
| Database | SQLite via `drizzle-orm` + `better-sqlite3` |
| Testing | Vitest (97% line/function coverage, 95% branch) |
| Linting | oxlint with custom rules |
| Monorepo | Bun workspaces |

## Project Structure

```
jiratown/
├── packages/
│   ├── core/              # @jiratown/core — main library
│   │   └── src/
│   │       ├── bootstrap.ts      # Main entry — creates Jiratown instance
│   │       ├── config/           # TOML config loading & validation
│   │       ├── context/          # Async context (useJiratown)
│   │       ├── db/               # SQLite schema, controllers
│   │       ├── lib/
│   │       │   ├── git/          # Git worktree operations
│   │       │   └── hooks/        # Event system (mitt)
│   │       ├── plugins/          # Plugin system & core tools
│   │       ├── services/
│   │       │   ├── memory/       # L1 (context.md) + L2 (semantic search)
│   │       │   └── monitor/      # Polling framework
│   │       └── workflow/
│   │           ├── orchestrator/ # Agent lifecycle, adapters, tools
│   │           ├── steering/     # Autonomous steering rules
│   │           └── tracker/      # Issue parsing, prompt building
│   └── plugins/           # External plugins
│       ├── github/        # @jiratown/plugin-github
│       ├── jira/          # @jiratown/plugin-jira
│       └── pi-adapter/    # @jiratown/plugin-pi-adapter
├── oxlint/                # Custom lint rules
├── plan/                  # Build plan documentation
└── scripts/
```

## Key Concepts

### 1. Bootstrap (`bootstrap.ts`)

Creates a `Jiratown` instance — the main entry point:

```typescript
const jt = await bootstrap();
// Access: jt.config, jt.db, jt.hooks, jt.memory, jt.monitors, jt.tracker, jt.orchestrator, jt.plugins
await jt.shutdown();
```

Components initialized:
- **Config** — Loaded from TOML files (global → project cascade)
- **Database** — SQLite with issues, events, notifications tables
- **Hooks** — Event pub/sub via mitt
- **Memory** — L1 + L2 memory service
- **Monitors** — Polling framework
- **Tracker** — Issue parsing + prompt building
- **Orchestrator** — Agent lifecycle management
- **Plugins** — Plugin registry with core plugins

### 2. Context System (`context/`)

Uses `unctx` for async context propagation:

```typescript
// Inside plugin setup or any code running in context
const { db, hooks, memory, config } = useJiratown();

// Running code with context
runWithContext(context, async () => {
  // useJiratown() works here
});
```

### 3. Plugin System (`plugins/`)

Plugins extend Jiratown via `definePlugin()`:

```typescript
import { definePlugin } from "@jiratown/core";
import { z } from "zod/v4";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },
  configSchema: z.object({
    apiKey: z.string(),
  }),
  setup(config) {
    const { hooks, db } = useJiratown();
    // Register parsers, tools, monitors, steering rules
  },
  teardown() {
    // Cleanup
  },
});
```

**Plugin Types:**
- **Integration plugins** — Connect to external services (Jira, GitHub)
- **Adapter plugins** — Register agent harnesses (Pi, Claude Code, Opencode)

### 4. HarnessOrchestrator (`workflow/orchestrator/`)

Manages agent lifecycle with pluggable adapters:

```typescript
// Register an adapter (in plugin setup)
orchestrator.registerAdapter("pi", PiAgentAdapter);

// Register tools for agents
orchestrator.registerTool({
  name: "acknowledge",
  description: "Acknowledge a notification",
  parameters: { /* JSON Schema */ },
  execute: async (params, context) => { /* ... */ },
});

// Spawn an agent
const agent = await orchestrator.spawn({
  harness: "pi",
  issue,
  prompt,
  worktreePath,
});
```

**AgentAdapter** — Abstract class for harness implementations:
- `initialize()` — Set up the agent
- `start()` — Begin agent execution
- `sendMessage()` — Send messages to running agent
- `stop()` — Graceful shutdown

### 5. Tracker (`workflow/tracker/`)

Parses user input and builds prompts:

```typescript
// Register a parser (in plugin setup)
tracker.registerParser(createJiraParserOptions(client));

// Parse input
const parsed = await tracker.parseInput("PROJ-123");
// Returns: { source: "jira", key: "PROJ-123", issue: {...} }

// Build prompt with context
const prompt = await tracker.buildPrompt(parsed, memory);
```

**Components:**
- **IssueParser** — Parses ticket keys, URLs via plugin-registered parsers
- **PromptEngineer** — Builds prompts with L1/L2 memory context

### 6. MemoryService (`services/memory/`)

Two-tier memory system:

**L1 Store** — Per-worktree session memory (`context.md` files):
```typescript
// Read current session memory
const session = memory.l1.get(worktreePath);

// Append to session
await memory.l1.context(worktreePath).appendSession(entry);
```

**L2 Store** — Semantic search via `retriv` (BM25 + vector):
```typescript
// Index a document
await memory.l2.index({
  id: "doc-1",
  type: "issue",
  content: "Issue description...",
  metadata: { issueId: 123 },
});

// Search
const results = await memory.l2.search("authentication bug", {
  limit: 10,
  types: ["issue", "comment"],
});
```

**NotificationService** — Push-based notifications:
```typescript
// Create notification
await memory.notifications.create({
  issueId: 123,
  type: "pr_review",
  title: "Review requested",
  body: "...",
  priority: "high",
});

// Get unread for issue
const unread = await memory.notifications.getUnread(issueId);
```

### 7. MonitorService (`services/monitor/`)

Polling framework for background tasks:

```typescript
// Register a monitor (in plugin setup)
monitors.registerMonitor({
  id: "github-pr",
  issueId: 123,
  interval: 30000,
  poll: async (context) => {
    // Check for updates
    return { status: "ok", data: { reviews: [...] } };
  },
});

// Start monitoring
monitors.startMonitor("github-pr", 123);

// Stop
monitors.stopMonitor("github-pr", 123);
```

### 8. SteeringRule (`workflow/steering/`)

Autonomous rules for agent behavior:

```typescript
// Register a steering rule (in plugin setup)
orchestrator.registerSteeringRule(
  new SteeringRule({
    name: "idle-reminder",
    condition: {
      event: "agent:idle",
      minInterval: 300000, // 5 min debounce
    },
    action: (event, issue) => {
      // Send reminder to agent
    },
  })
);
```

**Conditions:**
- Event-based triggers (`agent:idle`, `pr:review_requested`, etc.)
- Debouncing with `minInterval`
- Issue-scoped or global

### 9. Hooks (`lib/hooks/`)

Event pub/sub via mitt:

```typescript
// Subscribe
hooks.on("agent:started", (payload) => {
  console.log("Agent started:", payload.issueId);
});

// Emit
hooks.emit("agent:started", { issueId: 123 });

// One-time listener
hooks.once("agent:stopped", handler);
```

**Key Events:**
- `agent:started`, `agent:stopped`, `agent:idle`, `agent:message`
- `issue:created`, `issue:updated`, `issue:status_changed`
- `pr:opened`, `pr:merged`, `pr:review_requested`
- `notification:created`, `notification:acknowledged`
- `prompt:building` (for plugins to add context blocks)

## Data Flow

```
User Input (ticket key/URL)
    │
    ▼
┌─────────┐
│ Tracker │ ← Plugin-registered parsers
└────┬────┘
     │ ParsedIssue
     ▼
┌──────────────┐
│PromptEngineer│ ← L1/L2 memory context
└──────┬───────┘
       │ Prompt
       ▼
┌─────────────────┐
│HarnessOrchestrator│
└────────┬────────┘
         │ spawn()
         ▼
┌─────────────┐
│ AgentAdapter │ ← Pi, Claude Code, etc.
└──────┬──────┘
       │
       ▼
   AI Agent
       │
       ├─► Tool calls → OrchestratorTool implementations
       │
       ├─► Hooks emitted → SteeringRules evaluate
       │
       └─► MonitorService polls → Notifications pushed
```

## Configuration

TOML config with cascading merge (global → project):

```toml
[agent]
harness = "pi"              # "pi" | "claude-code" | "opencode"
model = "sonnet-4"

[behavior]
auto_resume = true
poll_interval = 30000       # ms

[prompt]
custom = """
Project-specific instructions.
"""

[plugins]
enabled = ["jira", "github"]

[plugins.jira]
cloud_id = "company.atlassian.net"

[plugins.github]
auto_poll_reviews = true
```

**Config Locations:**
- Global: `~/.jiratown.toml`, `~/.config/jiratown.toml`, or `~/.config/jiratown/config.toml`
- Project: `<repo>/.jiratown.toml`

**Data Directory:** `~/.local/share/jiratown/` (respects `XDG_DATA_HOME`)
