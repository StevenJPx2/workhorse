# Jiratown API Reference

Complete API reference for all Jiratown packages and their public interfaces.

## Table of Contents

1. [Core Package](#core-package)
2. [Plugin System](#plugin-system)
3. [Database](#database)
4. [Memory Service](#memory-service)
5. [Monitor Service](#monitor-service)
6. [Orchestrator](#orchestrator)
7. [Tracker](#tracker)
8. [Hooks](#hooks)
9. [Configuration](#configuration)
10. [Git Operations](#git-operations)
11. [Types Reference](#types-reference)

---

## Core Package

### bootstrap(options)

Initialize a Jiratown instance with all services.

```typescript
import { bootstrap } from "@jiratown/core";

const jt = await bootstrap({
  repoRoot: "/path/to/repo",      // Project root (default: cwd)
  plugins: [plugin1, plugin2],     // Additional plugins
  overrides: {                     // Config overrides
    agent: { model: "claude-sonnet-4" },
  },
});
```

**Returns:** `Promise<Jiratown>`

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `repoRoot` | `string` | `process.cwd()` | Project root directory |
| `plugins` | `Plugin[]` | `[]` | Plugins to register |
| `overrides` | `Partial<JiratownConfig>` | `{}` | Config overrides |

### Jiratown Interface

```typescript
interface Jiratown {
  readonly config: Readonly<JiratownConfig>;
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

### Context Functions

```typescript
// Get context (throws if not in context)
const ctx = useJiratown();

// Get context or undefined
const ctx = tryUseJiratown();

// Run code with context
await runWithContext(context, async () => {
  // useJiratown() works here
});

// Testing helpers
setContext(ctx);     // Set singleton context
unsetContext();      // Clear singleton context
```

---

## Plugin System

### definePlugin(options)

Create a Jiratown plugin.

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
    // Register capabilities
  },
  teardown() {
    // Cleanup
  },
});
```

### PluginManifest

```typescript
interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  capabilities?: {
    parsers?: string[];
    monitors?: string[];
    tools?: string[];
    adapters?: string[];
  };
}
```

### PluginRegistry

```typescript
const registry = new PluginRegistry();

registry.register(plugin);              // Add plugin
await registry.discoverCustomPlugins(); // Load from directories
await registry.setup();                 // Initialize all
await registry.teardown();              // Cleanup all

registry.has("name");                   // Check existence
registry.get("name");                   // Get plugin
registry.list();                        // List all plugins
```

---

## Database

### Database Class

```typescript
const db = await Database.create(":memory:");  // or "/path/to/db"

// Issues
const issue = await db.issues.insert({ externalId: "PROJ-123", source: "jira", ... });
await db.issues.getById(id);
await db.issues.getByExternalId("PROJ-123", "jira");
await db.issues.updateStatus(id, "in_progress");
await db.issues.getByStatus("pending");
await db.issues.delete(id);

// Events
await db.events.insert({ issueId, type: "comment", message: "..." });
await db.events.getForIssue(issueId);

// Notifications
await db.notifications.create({ issueId, source: "jira", title: "...", body: "..." });
await db.notifications.getUnread(issueId);
await db.notifications.markRead(id);
await db.notifications.acknowledgeMany([id1, id2]);

db.close();
```

### Issue Schema

```typescript
interface Issue {
  id: string;
  externalId: string;
  source: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  issueType: string;
  url: string | null;
  assignee: string | null;
  labels: string[];
  metadata: Record<string, unknown>;
  worktreePath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type IssueStatus = 
  | "pending" 
  | "queued" 
  | "planning" 
  | "implementing" 
  | "blocked" 
  | "in_review" 
  | "done";
```

### Notification Schema

```typescript
interface Notification {
  id: string;
  issueId: string;
  source: string;
  sourceId: string | null;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  readAt: Date | null;
  acknowledgedAt: Date | null;
}

type NotificationPriority = "blocking" | "high" | "normal" | "low";
type NotificationStatus = "unread" | "read" | "acknowledged";
```

---

## Memory Service

### MemoryService Class

```typescript
const memory = await MemoryService.create({
  db,
  hooks,
  worktreesRoot: "/path/to/worktrees",
  memoryDbPath: "/path/to/memory.db",
});
```

### L1 Store (Session Memory)

```typescript
const ctx = memory.l1.get("issue-id");
if (ctx) {
  const session = await ctx.read();
  await ctx.appendSession({
    timestamp: new Date(),
    status: "implementing",
    summary: ["Added new feature"],
    learnings: ["Learned about X"],
    filesChanged: ["src/file.ts"],
  });
  await ctx.updatePatterns(["Pattern 1", "Pattern 2"]);
}

// Register new worktree
const newCtx = memory.l1.register("issue-id", "/path/to/worktree");
await newCtx.create("Issue Title", "planning");

// Refresh worktree list
memory.l1.refresh();
```

### L2 Store (Semantic Search)

```typescript
// Index documents
await memory.l2.index([
  {
    id: "doc-1",
    content: "Document content...",
    metadata: {
      issueId: "issue-123",
      type: "session_memory",
    },
  },
]);

// Search
const results = await memory.l2.search("query", {
  limit: 10,
  returnContent: true,
  filter: { type: "session_memory" },
});

// Remove documents
await memory.l2.remove(["doc-1"]);

// Close
await memory.l2.close();
```

### NotificationService

```typescript
// Create (deduplicates by sourceId)
const notification = await memory.notifications.create({
  issueId: "issue-id",
  source: "jira",
  sourceId: "comment-123",
  priority: "high",
  title: "New Comment",
  body: "Comment content...",
  metadata: { author: "user" },
});

// Query
const unread = await memory.notifications.getUnread("issue-id");

// Generate XML for system prompt
const inboxXml = memory.notifications.generateInbox(unread);

// Lifecycle
await memory.notifications.markRead(id);
await memory.notifications.acknowledge([id1, id2, id3]);
```

---

## Monitor Service

### MonitorService Class

```typescript
// Register monitor (once at setup)
monitors.registerMonitor({
  id: "my-monitor",
  type: "remote",      // "remote" or "local"
  interval: 30000,     // Poll interval in ms
  poll: async (ctx) => {
    // ctx: { issueId, hooks, memory, config }
    const updates = await fetchUpdates(ctx.issueId);
    return {
      hasChanges: updates.length > 0,
      data: updates,
    };
  },
});

// Start for an issue
monitors.startMonitor("my-monitor", issueId);

// Stop
monitors.stopMonitor("my-monitor", issueId);
monitors.stopMonitors(issueId);

// Query
const running = monitors.getRunningMonitors(issueId);

// Shutdown all
monitors.shutdown();
```

### MonitorOptions

```typescript
interface MonitorOptions {
  id: string;
  type: "remote" | "local";
  interval: number;
  poll: (ctx: MonitorContext) => Promise<MonitorResult>;
}

interface MonitorContext {
  issueId: string;
  hooks: HookEmitter;
  memory: MemoryService;
  config: JiratownConfig;
}

interface MonitorResult {
  hasChanges: boolean;
  data?: unknown;
}
```

---

## Orchestrator

### HarnessOrchestrator Class

```typescript
// Register adapter
orchestrator.registerAdapter("my-harness", MyAgentAdapter);

// Register tool
orchestrator.registerTool({
  name: "my_action",
  description: "Does something",
  schema: {
    type: "object",
    properties: {
      param: { type: "string" },
    },
    required: ["param"],
  },
  execute: async (args, ctx) => {
    // ctx: { issueId, worktreePath, db, hooks, memory }
    return { success: true, output: "Done" };
  },
});

// Register steering rule
orchestrator.registerSteeringRule({
  id: "my-rule",
  name: "My Rule",
  description: "Reminds about something",
  condition: {
    status: ["implementing"],
    hook: ["agent.idle"],
    when: async (ctx) => true,
  },
  reminder: "Check your notifications.",
});

// Spawn agent
const adapter = await orchestrator.spawn({
  issue,
  repoPath: "/path/to/repo",
  baseBranch: "main",
  harness: "my-harness",
  model: "provider/model",
});

await adapter.start();

// Send message
await orchestrator.sendMessage("issue-id", "Message to agent");

// Get models
const models = orchestrator.getAllModels();
const piModels = orchestrator.getModelsForAdapter("pi");

// Shutdown
await orchestrator.shutdown();
```

### OrchestratorTool

```typescript
interface OrchestratorTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;  // JSON Schema
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<ToolResult>;
}

interface ToolExecutionContext {
  issueId: string;
  worktreePath: string;
  db: Database;
  hooks: HookEmitter;
  memory: MemoryService;
}

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

### AgentAdapter (Abstract)

```typescript
abstract class AgentAdapter {
  readonly issueId: string;
  readonly harness: string;
  readonly worktreePath: string;
  readonly systemPrompt: string;
  readonly initialMessage: string;
  
  state: AgentState;
  
  static readonly displayName: string;
  static readonly icon: string;
  
  // Factory method
  static async create(options: AdapterCreateOptions): Promise<AgentAdapter>;
  
  // Lifecycle
  async start(): Promise<void>;
  async stop(options?: StopOptions): Promise<void>;
  
  // Communication
  async sendMessage(content: string): Promise<void>;
  
  // Status
  isRunning(): boolean;
  
  // Subclass overrides
  protected abstract doStart(): Promise<void>;
  protected abstract doStop(): Promise<void>;
}

type AgentState = "stopped" | "starting" | "running" | "stopping" | "crashed";
```

---

## Tracker

### Tracker Class

```typescript
// Register parser
tracker.registerParser({
  source: "my-service",
  canParse: (input) => input.startsWith("MY-"),
  parse: async (input) => ({
    externalId: input,
    source: "my-service",
    title: "Issue Title",
    description: "Description",
    issueType: "task",
    url: "https://...",
    metadata: {},
  }),
});

// Parse input
const issue = await tracker.parseInput("MY-123");

// Build prompt
const prompt = await tracker.buildPrompt(issue.id);

// Build hybrid prompt
const { systemPrompt, initialMessage } = await tracker.buildHybridPrompt(issue.id, {
  tools: orchestratorTools,
});

// Fetch backlog
const backlog = await tracker.fetchBacklog();

// Delete issue
await tracker.deleteIssue(issue.id);
```

### IssueParserOptions

```typescript
interface IssueParserOptions {
  source: string;
  canParse: (input: string) => boolean;
  parse: (input: string) => Promise<ParsedIssue>;
}

interface ParsedIssue {
  externalId: string;
  source: string;
  title: string;
  description: string;
  issueType: string;
  url?: string;
  assignee?: string;
  labels?: string[];
  metadata: Record<string, unknown>;
}
```

---

## Hooks

### HookEmitter

```typescript
import { hooks } from "@jiratown/core";

// Subscribe
hooks.on("issue.status_changed", ({ issue, from, to }) => {
  console.log(`${issue.externalId}: ${from} → ${to}`);
});

// Emit
hooks.emit("my-plugin:event", { data: "value" });

// Unsubscribe
hooks.off("issue.status_changed", handler);

// One-time listener
hooks.once("agent.start.post", handler);

// Clear all
hooks.all.clear();
```

### Built-in Hook Events

| Event | Payload |
|-------|---------|
| `issue.parsed` | `{ issue, raw }` |
| `issue.status_changed` | `{ issue, from, to }` |
| `issue.deleted` | `{ issue }` |
| `prompt.building` | `{ issueId, context }` |
| `prompt.built` | `{ issueId, prompt }` |
| `agent.create.pre` | `{ issue, options }` |
| `agent.create.post` | `{ adapter }` |
| `agent.start.pre` | `{ adapter }` |
| `agent.start.post` | `{ adapter }` |
| `agent.stop.pre` | `{ adapter }` |
| `agent.stop.post` | `{ adapter }` |
| `agent.idle` | `{ issueId }` |
| `agent.tool_call` | `{ tool, args }` |
| `notification.created` | `{ notification, issueId }` |
| `monitor.registered` | `{ name, type }` |
| `monitor.tick` | `{ id, issueId, result }` |
| `monitor.error` | `{ id, issueId, error, errorCount }` |
| `steering.reminder` | `{ issueId, reminder }` |
| `plugin.loaded` | `{ name }` |
| `plugin.error` | `{ name, error }` |

### PromptBuildingContext

```typescript
interface PromptBuildingContext {
  issueId: string;
  context: {
    contextBlocks: PromptContextBlock[];
  };
}

interface PromptContextBlock {
  id: string;
  title: string;
  content: string;
  priority?: number;  // Lower = earlier in prompt
}
```

---

## Configuration

### Loading Config

```typescript
import { resolveConfigPaths, loadConfig, mergeConfigs } from "@jiratown/core";

const paths = resolveConfigPaths("/path/to/repo");
const config = loadConfig(paths);
const merged = mergeConfigs(config1, config2);
```

### Writing Config

```typescript
import { parseTomlFile, writeTomlFile, configToToml } from "@jiratown/core";

const data = parseTomlFile("/path/to/config.toml");
writeTomlFile("/path/to/config.toml", config);
const toml = configToToml(config);
```

### Credentials

```typescript
import { storeCredential, getCredential, deleteCredential } from "@jiratown/core";

await storeCredential("jiratown", "api_key", "secret");
const key = await getCredential("jiratown", "api_key");
await deleteCredential("jiratown", "api_key");
```

### JiratownConfig

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

---

## Git Operations

### Worktree Functions

```typescript
import { createWorktree, removeWorktree } from "@jiratown/core";

const worktree = await createWorktree(
  "/path/to/repo",   // Main repo path
  "PROJ-123",        // Issue ID
  "task",            // Issue type (branch prefix)
  "main",            // Base branch
);

if (worktree) {
  console.log(worktree.path);    // "/path/to/repo-worktrees/PROJ-123"
  console.log(worktree.branch);  // "task/PROJ-123"
  console.log(worktree.head);    // "abc123def..."
}

await removeWorktree("/path/to/repo", "PROJ-123", true);  // delete branch too
```

### WorktreeInfo

```typescript
interface WorktreeInfo {
  path: string;
  branch: string;
  issueId: string;
  head: string;
}
```

---

## Types Reference

### Core Types

```typescript
// Issue types
type IssueStatus = "pending" | "queued" | "planning" | "implementing" | "blocked" | "in_review" | "done";
type IssueType = "task" | "bug" | "story" | "epic" | (string & {});
type IssueSource = "jira" | "github" | "manual" | (string & {});

// Notification types
type NotificationPriority = "blocking" | "high" | "normal" | "low";
type NotificationStatus = "unread" | "read" | "acknowledged";

// Agent types
type AgentState = "stopped" | "starting" | "running" | "stopping" | "crashed";

// Memory types
type MemoryDocumentType = "session_memory" | "issue_context" | "decision" | "code_context" | (string & {});
```

### Zod Schemas

```typescript
import { 
  jiratownConfigSchema,
  IssueStatusSchema,
  NotificationPrioritySchema,
  NotificationStatusSchema,
} from "@jiratown/core";

// Validate config
const result = jiratownConfigSchema.safeParse(data);

// Validate status
const status = IssueStatusSchema.parse("implementing");
```

---

## Error Handling

### Tool Errors

```typescript
execute: async (args, ctx) => {
  try {
    // Work
    return { success: true, output: "Done" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### Plugin Errors

```typescript
hooks.on("plugin.error", ({ name, error }) => {
  console.error(`Plugin ${name} failed:`, error);
});
```

### Monitor Errors

```typescript
hooks.on("monitor.error", ({ id, issueId, error, errorCount }) => {
  console.error(`Monitor ${id} failed ${errorCount} times:`, error);
  // Monitors self-stop after 5 consecutive errors
});
```
