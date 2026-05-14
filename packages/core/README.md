# workhorse-core

The foundation of Workhorse — an autonomous AI agent orchestration framework for software development.

## What This Package Does

This package provides everything needed to orchestrate AI coding agents working on external issues (Jira, GitHub). It handles:

- **Plugin architecture** for extensibility without coupling
- **Two-tier memory system** for fast session context + semantic search
- **Event-driven hooks** for loose module coupling
- **Agent lifecycle management** through harness adapters
- **Issue tracking abstraction** across different sources

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          bootstrap()                             │
│  Creates Workhorse instance with all services wired together     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
    ┌─────────┐          ┌──────────┐          ┌─────────┐
    │ Config  │          │ Database │          │  Hooks  │
    │  TOML   │          │  SQLite  │          │  Events │
    └─────────┘          └────┬─────┘          └────┬────┘
                              │                     │
              ┌───────────────┼─────────────────────┤
              │               │                     │
              ▼               ▼                     ▼
      ┌───────────────┐ ┌───────────────┐ ┌─────────────────┐
      │ MemoryService │ │MonitorService │ │    Plugins      │
      │  L1 + L2 +    │ │   Polling     │ │ Parser/Adapter  │
      │ Notifications │ │   Framework   │ │   Registration  │
      └───────┬───────┘ └───────────────┘ └────────┬────────┘
              │                                    │
              └────────────┬───────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌──────────┐     ┌──────────────────┐
    │ Tracker │      │ Steering │     │   Orchestrator   │
    │ Parsers │      │  Rules   │     │ Adapters + Tools │
    │ Prompts │      └────┬─────┘     └────────┬─────────┘
    └────┬────┘           │                    │
         │                └────────┬───────────┘
         │                         │
         └─────────────────────────┼──────────────────────┐
                                   │                      │
                                   ▼                      ▼
                            ┌─────────────┐        ┌─────────────┐
                            │AgentAdapter │        │AgentAdapter │
                            │  (issue 1)  │        │  (issue 2)  │
                            └─────────────┘        └─────────────┘
```

## Modules

### Context System (`src/context/`)

**Problem:** Dependency injection without prop drilling.

Uses `unctx` + `AsyncLocalStorage` to provide services throughout the call tree:

```typescript
// In any code within context scope:
const { db, hooks, tracker } = useWorkhorse();

// Safe access (undefined outside scope):
const ctx = tryUseWorkhorse();
```

**Why it exists:** Plugins need access to services during `setup()` without receiving them as parameters. AsyncLocalStorage scopes access to the current execution context.

**Used by:** Every other module, all plugins.

### Config (`src/config/`)

**Problem:** Manage configuration from multiple sources with validation.

```
Hierarchy (later overrides earlier):
1. ~/.workhorse.toml (or ~/.config/workhorse/config.toml)
2. .workhorse.toml in repo root
3. Runtime overrides via bootstrap()
```

Includes keychain integration for secure credential storage:

```typescript
await storeCredential("jira", { accessToken: "..." });
const creds = await getCredential("jira");
```

**Used by:** Bootstrap, plugins (via `ctx.config`).

### Database (`src/db/`)

**Problem:** Persist issues, events, and notifications with type safety.

```
Database
├── IssueController    → issues table
├── EventController    → issue_events table
└── NotificationController → notifications table
```

Uses **Drizzle ORM** with libsql (Bun-compatible SQLite). Schemas define both database structure and Zod validators:

```typescript
// Insert a new issue
await db.issues.insert({
  externalId: "PROJ-123",
  source: "jira",
  status: "queued",
  metadata: { title: "Fix bug" }
});

// Query with type safety
const pending = await db.issues.findByStatus("pending");
```

**Used by:** MemoryService, Tracker, AgentAdapter, plugins.

### Hooks (`src/lib/hooks/`)

**Problem:** Decoupled event-driven communication.

Wraps `hookable` with a simpler API:

```typescript
// Subscribe (returns unsubscribe function)
const unsub = hooks.on("issue.parsed", ({ issue }) => {
  console.log("Issue:", issue.externalId);
});

// Fire-and-forget
hooks.emit("agent.idle", { adapter });

// Await all handlers
await hooks.callHook("prompt.building", { contextBlocks });
```

**Core events:**

| Category | Events |
|----------|--------|
| Issues | `issue.parsed`, `issue.status_changed`, `issue.deleted` |
| Prompts | `prompt.building`, `prompt.built` |
| Agent | `agent.create.pre/post`, `agent.start.pre/post`, `agent.stop.pre/post`, `agent.idle`, `agent.output` |
| Steering | `steering.reminder` |
| Notifications | `notification.created` |
| Monitors | `monitor.registered`, `monitor.tick`, `monitor.error` |
| Plugins | `plugin.loaded`, `plugin.error` |
| TUI | `tui.register_renderer` |

**Deferred hooks pattern:** During plugin setup, certain hooks are buffered and replayed after all plugins have subscribed. This solves the ordering problem where Plugin A emits during setup but Plugin B hasn't subscribed yet.

**Used by:** All modules, all plugins.

### Plugin System (`src/plugins/`)

**Problem:** Extensibility without coupling.

```typescript
export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    capabilities: {
      parsers: ["my-source"],
      monitors: ["my-monitor"],
      tools: ["my-tool"],
    },
  },

  // Optional: validated config from [plugins.my-plugin] section
  configSchema: z.object({
    apiKey: z.string(),
  }),

  setup(ctx, config) {
    // Register extensions
    ctx.tracker.registerParser({ ... });
    ctx.orchestrator.registerTool({ ... });
    ctx.monitors.registerMonitor({ ... });

    // React to events
    ctx.hooks.on("issue.parsed", handler);
  },

  teardown() {
    // Cleanup
  },
});
```

**Plugin discovery order:**
1. User-provided plugins (`bootstrap({ plugins })`)
2. Custom plugins from `~/.workhorse/plugins/` and `.workhorse/plugins/`
3. Core plugins (built-in tools, local parser)

User plugins register first, so their parsers take precedence.

**Used by:** Bootstrap, all external plugins.

### Workflow Orchestrator (`src/workflow/orchestrator/`)

**Problem:** Manage agent lifecycles across different AI harnesses.

```typescript
// Plugin registers an adapter class
orchestrator.registerAdapter("my-harness", MyAdapter);

// Spawn agent for an issue
const adapter = await orchestrator.spawn({
  issueId: "issue-123",
  harness: "my-harness",
  model: "claude-sonnet-4",
});

// Agent lifecycle
await adapter.start();
adapter.sendMessage("Please implement the login form");
await adapter.stop();
```

**AgentAdapter** is the abstract base class:

```typescript
abstract class AgentAdapter {
  // Identity
  abstract readonly harness: string;
  static displayName: string;
  static icon: string;
  static registry: ModelRegistry;

  // Lifecycle
  async initialize(): Promise<void>;  // Setup worktree + build prompt
  async start(): Promise<void>;       // Begin agent execution
  async sendMessage(content: string): Promise<void>;
  async stop(): Promise<void>;        // Terminate

  // State
  issue: Issue;
  worktreePath: string;
  state: AgentState;
  tools: OrchestratorTool[];
  steering: SteeringRule[];
}
```

**Tool registration:**

```typescript
orchestrator.registerTool({
  name: "my_tool",
  description: "Does something useful",
  schema: { type: "object", properties: { ... } },
  async execute(args, ctx) {
    return { content: "result" };
  },
});
```

Tools are harness-agnostic — adapters translate to native format.

**Used by:** Harness plugins (pi-adapter, claude-code, opencode), TUI.

### Steering System (`src/workflow/steering/`)

**Problem:** Guide agents when they go idle.

Plugins register steering rules that fire reminders based on conditions:

```typescript
orchestrator.registerSteeringRule({
  id: "github:create-pr",
  name: "Remind to create PR",
  priority: 10,

  // When this rule applies
  condition: {
    status: ["in-progress"],
    source: ["github"],
    when: (ctx) => ctx.fileChangesExist && !ctx.prExists,
  },

  // What to remind
  reminder: (ctx) => `You have changes but no PR. Run \`gh pr create\`.`,
});
```

**Flow:**
1. Agent goes idle → `agent.idle` hook fires
2. SteeringRule evaluates conditions
3. If matched: build context → call `reminder()` → emit `steering.reminder`
4. AgentAdapter sends reminder to agent

**Used by:** GitHub plugin, Jira plugin, custom plugins.

### Tracker (`src/workflow/tracker/`)

**Problem:** Parse user input into issues and build prompts with context.

**Issue parsing:**

```typescript
// Plugin registers a parser
tracker.registerParser({
  source: "jira",
  canParse: (input) => /^[A-Z]+-\d+$/.test(input),
  parse: async (input) => {
    const issue = await jiraClient.fetch(input);
    return { externalId: input, source: "jira", metadata: issue };
  },
});

// User provides input → tracker tries parsers in order
const issue = await tracker.parseInput("PROJ-123");
```

**Prompt building:**

```typescript
const prompt = await tracker.buildPrompt(issueId);
// Includes: issue context, L1 memory, L2 search, notifications, custom instructions
```

The `prompt.building` hook lets plugins contribute context blocks:

```typescript
hooks.on("prompt.building", (ctx) => {
  ctx.contextBlocks.push({
    id: "github-pr",
    title: "Pull Request",
    content: "PR #45 has 2 pending reviews...",
    priority: 10,  // Lower = earlier in prompt
  });
});
```

**Used by:** Orchestrator, GitHub/Jira plugins.

### Memory Service (`src/services/memory/`)

**Problem:** Provide both fast session memory and long-term semantic search.

**Two-tier architecture:**

| Tier | Storage | Use Case |
|------|---------|----------|
| L1 | `.workhorse/session/context.md` per worktree | Fast read/write, structured sections |
| L2 | retriv (FTS5 + vectors) | Semantic search across history |

```typescript
// L1: Per-issue session memory
const l1 = memory.l1.forIssue(issueId);
await l1.write("## Decisions\n- Use React for UI");
const content = await l1.read();

// L2: Semantic search
const results = await memory.l2.search({
  query: "authentication implementation",
  issueId: "issue-123",
  limit: 5,
});
```

**Notifications:**

```typescript
// Add notification (deduplicated by sourceId)
await memory.notifications.add({
  issueId: "issue-123",
  sourceId: "github-review-456",
  type: "pr_review",
  priority: "high",
  message: "Changes requested on PR #45",
});

// Get unread as XML for agent prompt
const inbox = memory.notifications.formatInbox(issueId);
```

**Used by:** PromptEngineer, AgentAdapter, monitors.

### Monitor Service (`src/services/monitor/`)

**Problem:** Poll external systems for changes.

Two-phase API:

```typescript
// 1. Plugin registers monitor definition
monitors.registerMonitor({
  id: "github-pr",
  type: "remote",
  interval: 30000,
  async poll(ctx) {
    const pr = await github.getPR(ctx.metadata.prNumber);
    return { hasChanges: true, data: pr };
  },
});

// 2. Start polling for specific issue
monitors.startMonitor("github-pr", issueId);
```

Auto-stops after 5 consecutive errors. Emits `monitor.tick` on changes.

**Used by:** GitHub plugin, Jira plugin.

### Auth (`src/auth/`)

**Problem:** Unified authentication for plugins with different flows.

| Type | Description | Example |
|------|-------------|---------|
| `oauth` | Full OAuth 2.0 with local callback | Jira Cloud |
| `external` | Delegate to CLI tool | GitHub CLI |
| `apitoken` | User-provided API token | Linear |
| `none` | No auth required | Local parser |

```typescript
definePlugin({
  auth: {
    provider: "oauth",
    createAuthorizationURL: () => oauthClient.createAuthorizationURL(),
    validateAuthorizationCode: (code) => oauthClient.validateCode(code),
    saveTokens: (tokens) => storeCredential("jira", tokens),
  },
});
```

**Used by:** Jira plugin, GitHub plugin, TUI (auth flows).

### Git Utilities (`src/lib/git/`)

**Problem:** Manage isolated working directories per issue.

```typescript
// Create worktree (idempotent - reuses if exists)
const path = await createWorktree(repoPath, "PROJ-123", "feat", "main");
// → ../repo-worktrees/PROJ-123 with branch feat/PROJ-123

// Clean up
await removeWorktree(repoPath, "PROJ-123", { deleteBranch: true });
```

**Used by:** AgentAdapter, Tracker (deleteIssue).

### Path Validation (`src/lib/paths/`)

**Problem:** Prevent agents from escaping their worktree.

```typescript
const validator = createPathValidator({
  rootDir: worktreePath,
  additionalAllowedDirs: ["/tmp"],
});

if (validator.isAllowed(path)) {
  // Safe
}

validator.assert(path); // Throws if not allowed
```

**Used by:** Tool implementations, Pi adapter.

### Metadata Footer (`src/lib/metadata-footer.ts`)

**Problem:** Identify agent-generated content.

```typescript
const body = withWorkhorseFooter("PR description here");
// Adds hidden footer marker

if (isWorkhorseGenerated(comment.body)) {
  // Skip in monitors to avoid infinite loops
}
```

**Used by:** GitHub plugin, Jira plugin.

## Cross-Cutting Patterns

### 1. Event-Driven Architecture

All modules communicate via hooks. This enables loose coupling and plugin extensibility.

### 2. Context Injection

`useWorkhorse()` provides services without explicit passing:

```typescript
const { db, hooks, orchestrator } = useWorkhorse();
```

### 3. Factory Methods

Complex classes use `static async create()`:

```typescript
const db = await Database.create(path);
const memory = await MemoryService.create(options);
```

### 4. Zod Validation

External data validated with Zod schemas that double as type definitions:

```typescript
export const IssueStatusSchema = z.enum(["pending", "queued", ...]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;
```

## Usage

```typescript
import { bootstrap } from "workhorse-core";
import myPlugin from "./my-plugin";

const workhorse = await bootstrap({
  repoPath: "/path/to/repo",
  plugins: [myPlugin],
});

// Parse and spawn
const issue = await workhorse.tracker.parseInput("PROJ-123");
const agent = await workhorse.orchestrator.spawn({
  issueId: issue.id,
  harness: "pi-coding-agent",
  model: "claude-sonnet-4",
});

await agent.start();
```
