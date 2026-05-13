# workhorse-core

Core library for Workhorse — an AI-powered agent orchestrator for Jira and GitHub issues. Provides config management, plugin system, database, memory, monitoring, agent orchestration, and steering.

## Installation

```bash
bun add workhorse-core
```

## Quick Start

```typescript
import { bootstrap } from "workhorse-core";

const wh = await bootstrap({ repoRoot: process.cwd() });

// Access services
wh.config;         // Loaded configuration
wh.paths;          // Resolved file paths
wh.db;             // SQLite database
wh.memory;         // L1 + L2 memory + notifications
wh.monitors;       // Polling framework
wh.hooks;          // Event pub/sub
wh.tracker;        // Issue parsing + prompt building
wh.orchestrator;   // Agent lifecycle management
wh.plugins;        // Plugin registry

// Shutdown
await wh.shutdown();
```

## Bootstrap

`bootstrap()` initializes a complete Workhorse instance with all services:

```typescript
import { bootstrap, type BootstrapOptions, type Workhorse } from "workhorse-core";

const wh: Workhorse = await bootstrap({
  repoRoot: "/path/to/repo",       // Project root (default: cwd)
  plugins: [jiraPlugin, githubPlugin],  // Additional plugins
  overrides: {                      // Config overrides
    agent: { model: "claude-sonnet-4" },
  },
});
```

### Workhorse Interface

```typescript
interface Workhorse {
  readonly config: Readonly<WorkhorseConfig>;
  readonly paths: Readonly<ConfigPaths>;
  readonly db: Database;
  readonly memory: MemoryService;
  readonly monitors: MonitorService;
  readonly hooks: HookEmitter;
  readonly tracker: Tracker;
  readonly orchestrator: HarnessOrchestrator;
  readonly plugins: PluginRegistry;
  shutdown(): Promise<void>;
}
```

### Shutdown Order

```
orchestrator.shutdown()  →  Stop all agents
monitors.shutdown()      →  Stop all monitors
plugins.teardown()       →  Teardown plugins in reverse order
memory.shutdown()        →  Close L2 store
db.close()               →  Close database
hooks.all.clear()        →  Clear all event listeners
```

## Context System

Access the Workhorse instance from anywhere using async context:

```typescript
import { useWorkhorse, tryUseWorkhorse } from "workhorse-core";

// Inside plugin setup or any code running in context:
function myFunction() {
  const { config, hooks, db, memory, monitors, tracker, orchestrator, paths } = useWorkhorse();
}

// Safe access (returns undefined if not in context)
const ctx = tryUseWorkhorse();
```

### Running Code with Context

```typescript
import { runWithContext } from "workhorse-core";

await runWithContext(context, async () => {
  // useWorkhorse() works here
});
```

### Testing Helpers

```typescript
import { setContext, unsetContext } from "workhorse-core";

// Set singleton context for testing
setContext({ config, hooks });

// Clear after test
unsetContext();
```

## Configuration

### File Locations

**Global** (first found wins):
1. `~/.workhorse.toml`
2. `~/.config/workhorse.toml`
3. `~/.config/workhorse/config.toml`

**Project**: `<repo>/.workhorse.toml`

**Data directory**: `~/.local/share/workhorse/` (respects `XDG_DATA_HOME`)

### Config Loading

```typescript
import { resolveConfigPaths, loadConfig, mergeConfigs } from "workhorse-core";

// Resolve paths
const paths = resolveConfigPaths("/path/to/repo");

// Load and merge (defaults ← global ← project)
const config = loadConfig(paths);

// Deep merge configs (last wins)
const merged = mergeConfigs(baseConfig, overrideConfig);
```

### TOML Operations

```typescript
import { parseTomlFile, writeTomlFile, configToToml } from "workhorse-core";

// Read
const data = parseTomlFile("/path/to/config.toml");

// Write
writeTomlFile("/path/to/config.toml", { agent: { harness: "opencode" } });

// Convert to string
const toml = configToToml({ agent: { harness: "opencode" } });
```

### Credential Storage

```typescript
import { storeCredential, getCredential, deleteCredential } from "workhorse-core";

await storeCredential("workhorse", "github_token", "ghp_xxx");
const token = await getCredential("workhorse", "github_token");
await deleteCredential("workhorse", "github_token");
```

### Config Schema

```toml
[agent]
harness = "pi-coding-agent"     # Agent adapter to use
model = "claude-sonnet-4"       # Model override (optional)

[behavior]
auto_resume = true              # Auto-resume agents on restart
poll_interval = 30000           # Default monitor interval (ms)

[prompt]
custom = """                    # Custom instructions for agents (optional)
Project-specific instructions.
"""

[ui]
theme = "tokyonight"            # TUI theme

[steering]
enabled = true                  # Enable steering rules
debounce_ms = 2000             # Idle debounce before evaluation
max_reminders = 3              # Max reminders per rule
cooldown_ms = 30000            # Min time between reminders

[plugins]
disabled = []                   # Plugins to disable

# Plugin-specific config (under [plugins.<name>])
[plugins.jira]
cloud_id = "company.atlassian.net"
poll_interval = 30000

[plugins.github]
poll_interval = 30000
```

### TypeScript Interface

```typescript
interface WorkhorseConfig {
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

interface ConfigPaths {
  globalDir: string;
  globalConfig: string;
  projectConfig: string;
  database: string;
  memoryDatabase: string;
  worktreesRoot: string;
}
```

### Case Conversion

TOML uses `snake_case`, TypeScript uses `camelCase`. The loader converts automatically:

```toml
[behavior]
auto_resume = true
poll_interval = 5000
```

```typescript
config.behavior.autoResume    // true
config.behavior.pollInterval  // 5000
```

## Plugin System

### Define a Plugin

```typescript
import { definePlugin, useWorkhorse } from "workhorse-core";
import { z } from "zod/v4";

// Plugin without config
export const simplePlugin = definePlugin({
  manifest: {
    name: "simple",
    version: "1.0.0",
  },
  setup() {
    const { hooks } = useWorkhorse();
    hooks.on("issue.parsed", ({ issue }) => console.log("Parsed:", issue.title));
  },
});

// Plugin with typed config
export const configuredPlugin = definePlugin({
  manifest: {
    name: "configured",
    version: "1.0.0",
  },
  configSchema: z.object({
    apiUrl: z.string().url(),
    timeout: z.number().default(5000),
  }),
  setup(config) {
    // config is typed as { apiUrl: string; timeout: number }
    console.log(`Connecting to ${config.apiUrl}`);
  },
  teardown() {
    console.log("Cleanup");
  },
});
```

### Plugin Registry

```typescript
import { PluginRegistry } from "workhorse-core";

const registry = new PluginRegistry();

// Register plugins
registry.register(myPlugin);

// Discover plugins from config and plugin directories
await registry.discoverCustomPlugins();

// Setup all plugins (validates config, calls setup functions)
await registry.setup();

// Teardown all plugins (in reverse order)
await registry.teardown();

// Query
registry.has("my-plugin");      // boolean
registry.get("my-plugin");      // Plugin | undefined
registry.list();                // Plugin[]
```

### Plugin Discovery

Plugins are loaded from:
1. `CORE_PLUGINS` — Always registered first (builtin-tools)
2. `bootstrap({ plugins })` — Provided at initialization
3. Plugin directories — `~/.workhorse/plugins/` and `.workhorse/plugins/`

### Plugin Capabilities

Plugins can extend Workhorse by:

| Capability | Method | Description |
|-----------|--------|-------------|
| Issue Parsers | `ctx.tracker.registerParser()` | Parse ticket keys/URLs into issues |
| Monitors | `ctx.monitors.registerMonitor()` | Poll external services for changes |
| Tools | `ctx.orchestrator.registerTool()` | Add functions agents can invoke |
| Adapters | `ctx.orchestrator.registerAdapter()` | Register agent harness implementations |
| Steering | `ctx.orchestrator.registerSteeringRule()` | Add idle agent behavior rules |
| Prompt Context | `ctx.hooks.on("prompt.building")` | Inject context into agent prompts |
| Status Sync | `ctx.hooks.on("issue.status_changed")` | Sync status to external systems |
| Notifications | `ctx.memory.notifications.create()` | Push notifications to agent inbox |
| TUI Rendering | `ctx.hooks.emit("tui.register_renderer")` | Register activity renderers |

### Plugin Lifecycle

1. **Registration** — `plugins.register(plugin)` adds to registry, emits `plugin.loaded`
2. **Setup** — `plugins.setup()` validates config and calls each plugin's `setup()`
3. **Runtime** — Plugin hooks and tools are active
4. **Teardown** — `plugins.teardown()` calls `teardown()` in reverse registration order

### Error Handling

When a plugin's setup fails:
1. `plugin.error` hook is emitted with `{ name, error }`
2. Error is re-thrown (fail fast behavior)
3. Registry stops setting up further plugins

## Hooks

Event-based pub/sub via `mitt`:

```typescript
import { hooks } from "workhorse-core";

// Subscribe
hooks.on("issue.parsed", ({ issue }) => console.log("Parsed:", issue.title));

// Emit
hooks.emit("issue.status_changed", { issue, from: "todo", to: "in_progress" });

// Unsubscribe
hooks.off("issue.parsed", handler);

// One-time listener
hooks.once("agent.started", handler);
```

### Built-in Events

| Event | Payload | When |
|-------|---------|------|
| `issue.parsed` | `{ issue, raw }` | Input parsed into an issue |
| `issue.status_changed` | `{ issue, from, to }` | Issue status updated |
| `issue.deleted` | `{ issue }` | Issue deleted from database |
| `prompt.building` | `{ issueId, context }` | Prompt being built (plugins add context) |
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
| `monitor.registered` | `{ name, type }` | Monitor definition registered |
| `monitor.tick` | `{ id, issueId, result }` | Monitor detected changes |
| `monitor.error` | `{ id, issueId, error, errorCount }` | Monitor poll threw error |
| `steering.reminder` | `{ issueId, reminder }` | Steering rule fired |
| `plugin.loaded` | `{ name }` | Plugin registered |
| `plugin.error` | `{ name, error }` | Plugin setup failed |

## Database

SQLite via `@libsql/client` + `drizzle-orm`:

```typescript
import { Database } from "workhorse-core";

const db = await Database.create(":memory:");  // or "/path/to/workhorse.db"

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
await db.notifications.create({ issueId, source: "jira", title: "New comment", body: "..." });
await db.notifications.getUnread(issueId);
await db.notifications.markRead(id);
await db.notifications.acknowledgeMany([id1, id2]);

db.close();
```

### Tables

| Table | Description |
|-------|-------------|
| `issues` | Tracked issues from external sources |
| `issue_events` | Events/activity log for issues |
| `notifications` | Push notifications for agents |

### Schema Details

**Issues**: `id`, `externalId`, `source`, `title`, `description`, `status`, `issueType`, `url`, `assignee`, `labels`, `metadata`, `worktreePath`, `createdAt`, `updatedAt`

**Notifications**: `id`, `issueId`, `source`, `sourceId` (unique, dedup), `priority`, `status`, `title`, `body`, `metadata`, `createdAt`, `readAt`, `acknowledgedAt`

**Events**: `id`, `issueId`, `type`, `message`, `metadata`, `createdAt`

## Memory Service

Two-tier memory system for agent context:

```typescript
// L1: Session memory (context.md per worktree)
const ctx = memory.l1.get("AM-123");
if (ctx) {
  const session = await ctx.read();
  await ctx.appendSession({ timestamp: new Date(), status: "implementing", ... });
}

// L2: Semantic search (retriv + FTS5 + vector embeddings)
await memory.l2.index([{ id: "doc-1", content: "...", metadata: { type: "decision" } }]);
const results = await memory.l2.search("authentication flow", { limit: 5 });

// Notifications
await memory.notifications.create({ issueId, source: "jira", title: "...", body: "..." });
const unread = await memory.notifications.getUnread(issueId);
const inboxXml = memory.notifications.generateInbox(unread);
```

See `src/services/memory/README.md` for full documentation.

## Monitor Service

Polling framework for external changes:

```typescript
// Register a monitor (once at plugin setup)
monitors.registerMonitor({
  id: "jira-comments",
  type: "remote",
  interval: 30_000,
  async poll(ctx) {
    const comments = await fetchNewComments(ctx.issueId);
    return { hasChanges: comments.length > 0, data: comments };
  },
});

// Start for an issue (from a hook)
monitors.startMonitor("jira-comments", issueId);

// Stop
monitors.stopMonitor("jira-comments", issueId);
monitors.stopMonitors(issueId);

// Query
const running = monitors.getRunningMonitors(issueId);

// Shutdown all
monitors.shutdown();
```

See `src/services/monitor/README.md` for full documentation.

## Tracker

Issue parsing and prompt building:

```typescript
// Register a parser (in plugin setup)
tracker.registerParser({
  source: "jira",
  canParse: (input) => /^[A-Z]+-\d+$/.test(input),
  parse: async (input) => fetchJiraIssue(input),
});

// Parse user input
const issue = await tracker.parseInput("AM-123");

// Build prompt
const prompt = await tracker.buildPrompt(issue.id);

// Fetch backlog
const backlog = await tracker.fetchBacklog();

// Delete issue (cleans up worktree too)
await tracker.deleteIssue(issue.id);
```

See `src/workflow/tracker/README.md` for full documentation.

## Orchestrator

Agent lifecycle management:

```typescript
// Register adapter (in plugin setup)
orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter);

// Register tools
orchestrator.registerTool({
  name: "my_action",
  description: "Does something",
  schema: { type: "object", properties: { ... } },
  execute: async (args, ctx) => ({ success: true, output: "Done" }),
});

// Register steering rules
orchestrator.registerSteeringRule({
  id: "review-reminder",
  name: "PR Review Reminder",
  description: "Reminds agents to check PR reviews",
  condition: { status: ["in_review"] },
  reminder: "Check for PR review feedback.",
});

// Spawn an agent
const agent = await orchestrator.spawn({
  issue,
  repoPath: "/path/to/repo",
  harness: "pi-coding-agent",
  model: "claude-sonnet-4",
});

await agent.start();

// Send message
await orchestrator.sendMessage("AM-123", "Please check the failing tests");

// Get models
const models = orchestrator.getAllModels();

// Shutdown all agents
await orchestrator.shutdown();
```

See `src/workflow/orchestrator/README.md` for full documentation.

## Steering

Autonomous rules for idle agent guidance:

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

See `src/workflow/steering/README.md` for full documentation.

## Built-in Tools

The core plugin registers three tools available to all agents:

| Tool | Description |
|------|-------------|
| `workhorse_acknowledge` | Mark notification(s) as read |
| `workhorse_update_status` | Update the current issue's status |
| `workhorse_escalate` | Escalate to a human when blocked |

## Git Worktree Operations

```typescript
import { createWorktree, removeWorktree } from "workhorse-core";

const worktree = await createWorktree("/path/to/repo", "PROJ-123", "task", "main");
console.log(worktree.path);    // "/path/to/repo-worktrees/PROJ-123"
console.log(worktree.branch);  // "task/PROJ-123"

await removeWorktree("/path/to/repo", "PROJ-123", true);  // delete branch too
```

## Module READMEs

Detailed documentation for each internal module:

- `src/config/README.md` — Config loading, validation, credentials
- `src/context/README.md` — Async context system
- `src/db/README.md` — Database schema and controllers
- `src/lib/hooks/README.md` — Event pub/sub system
- `src/lib/git/README.md` — Git worktree operations
- `src/plugins/README.md` — Plugin system and registry
- `src/services/memory/README.md` — L1/L2 memory and notifications
- `src/services/monitor/README.md` — Polling framework
- `src/workflow/orchestrator/README.md` — Agent lifecycle, adapters, tools
- `src/workflow/steering/README.md` — Autonomous steering rules
- `src/workflow/tracker/README.md` — Issue parsing and prompt building

## API Reference

### Config Module

| Export | Description |
|--------|-------------|
| `resolveConfigPaths(repoRoot?)` | Resolve config file paths |
| `loadConfig(paths)` | Load and merge configs |
| `parseTomlFile(path)` | Parse a TOML file |
| `mergeConfigs(...configs)` | Deep merge configs (last wins) |
| `configToToml(config)` | Convert config to TOML string |
| `writeTomlFile(path, config)` | Write config to TOML file |
| `storeCredential(service, key, value)` | Store in system keychain |
| `getCredential(service, key)` | Retrieve from keychain |
| `deleteCredential(service, key)` | Remove from keychain |
| `workhorseConfigSchema` | Zod schema for config validation |
| `defaultConfig` | Default config values |

### Plugin Module

| Export | Description |
|--------|-------------|
| `definePlugin(options)` | Create a plugin |
| `PluginRegistry` | Plugin management class |
| `isPlugin(value)` | Type guard for plugins |
| `PluginSymbol` | Symbol identifying plugins |

### Context Module

| Export | Description |
|--------|-------------|
| `useWorkhorse()` | Get current Workhorse context (throws if not in context) |
| `tryUseWorkhorse()` | Get context or `undefined` |
| `runWithContext(ctx, fn)` | Execute function with context |
| `setContext(ctx)` | Set singleton context (testing only) |
| `unsetContext()` | Clear singleton context (testing only) |

### Database Module

| Export | Description |
|--------|-------------|
| `Database` | Database class (async factory: `Database.create()`) |
| `dateText`, `nullableDateText` | Custom Drizzle column types |
| `IssueStatusSchema` | Zod schema for issue status |
| `NotificationPrioritySchema` | Zod schema for notification priority |
| `NotificationStatusSchema` | Zod schema for notification status |

### Hooks Module

| Export | Description |
|--------|-------------|
| `hooks` | Global hook emitter instance |
| `HookEmitter` | Emitter type |
| `HookEventMap` | Type map for all events |
| `PromptBuildingContext` | Context for `prompt.building` |
| `PromptContextBlock` | Block of context for prompts |

### Orchestrator Module

| Export | Description |
|--------|-------------|
| `HarnessOrchestrator` | Agent lifecycle manager |
| `AgentAdapter` | Abstract adapter base class |
| `ModelRegistry` | Abstract model registry base class |
| `SteeringRule` | Autonomous steering rule class |
| `OrchestratorTool`, `ToolExecutionContext`, `ToolResult` | Tool types |
| `ModelInfo`, `AgentState`, `AdapterInfo` | Agent/adapter types |
| `SteeringRuleConfig`, `SteeringCondition`, `SteeringContext` | Steering types |

### Memory Module

| Export | Description |
|--------|-------------|
| `MemoryService` | Facade class (L1 + L2 + notifications) |
| `L1Store` | Session memory store |
| `L2Store` | Semantic search store |
| `NotificationService` | Notification manager |
| `generateSystemInbox` | XML generation for agent prompts |
| `parseSessionMemory`, `serializeSessionMemory` | Markdown ↔ SessionMemory |
| `SessionMemory`, `SessionEntry` | Session memory types |
| `MemoryDocument`, `SearchResult` | L2 types |
| `CreateNotificationInput` | Notification creation input |

### Monitor Module

| Export | Description |
|--------|-------------|
| `MonitorService` | Polling framework manager |
| `MonitorOptions` | Monitor definition options |
| `MonitorContext`, `MonitorResult`, `MonitorStatus` | Monitor types |

### Tracker Module

| Export | Description |
|--------|-------------|
| `Tracker` | Issue parsing and prompt building |
| `IssueParserOptions` | Parser registration options |
| `ParsedIssue` | Intermediate parse result |
| `IssueSource`, `IssueType` | Source/type identifiers |

### Bootstrap

| Export | Description |
|--------|-------------|
| `bootstrap(options)` | Initialize Workhorse instance |
| `BootstrapOptions` | Bootstrap configuration |
| `Workhorse` | Initialized instance interface |

## License

MIT
