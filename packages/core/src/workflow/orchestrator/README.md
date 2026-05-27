# Orchestrator

Agent lifecycle management with pluggable adapters, tools, and steering rules.

## Overview

The orchestrator module manages the complete lifecycle of AI coding agents:

- **Agent adapters** — Pluggable harness implementations (Pi, Claude Code, Opencode, etc.)
- **Tools** — Functions agents can invoke during execution
- **Steering rules** — Autonomous behavior rules for idle agents
- **Model registry** — Available models per adapter

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   HarnessOrchestrator                       │
│                                                            │
│  Adapters ────────────────── Tools ────────── Steering      │
│  ┌──────────┐               ┌──────┐        ┌───────────┐  │
│  │ Pi       │               │ack   │        │ idle      │  │
│  │ Claude   │               │escal │        │ review    │  │
│  │ Opencode │               │PR    │        │ blocked   │  │
│  └──────────┘               └──────┘        └───────────┘  │
│                                                            │
│  Model Registry ──────────── Agents (running)              │
│  ┌──────────┐               ┌──────────────┐              │
│  │ pi:      │               │ AM-123: Pi   │              │
│  │  sonnet  │               │ PROJ-456: Pi │              │
│  │  opus    │               └──────────────┘              │
│  └──────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Register an Adapter

Plugins register adapter classes during setup. Each adapter must extend `AgentAdapter`:

```typescript
import { AgentAdapter, definePlugin } from "workhorse-core";

class MyAdapter extends AgentAdapter {
  override readonly harness = "my-harness";
  static override readonly displayName = "My Harness";
  static override readonly icon = "🔧";

  protected override async doStart(): Promise<void> {
    /* ... */
  }
  override async sendMessage(content: string): Promise<void> {
    /* ... */
  }
  protected override async doStop(): Promise<void> {
    /* ... */
  }
  override isRunning(): boolean {
    /* ... */
  }
}

export default definePlugin({
  manifest: { name: "my-harness", version: "1.0.0" },
  setup(ctx) {
    ctx.orchestrator.registerAdapter("my-harness", MyAdapter);
  },
});
```

### Register Tools

Tools are functions that agents can invoke. They have a JSON Schema for parameters:

```typescript
import type {
  OrchestratorTool,
  ToolExecutionContext,
  ToolResult,
} from "workhorse-core";

const myTool: OrchestratorTool = {
  name: "my_action",
  description: "Performs a custom action",
  schema: {
    type: "object",
    properties: {
      param: { type: "string", description: "Action parameter" },
    },
    required: ["param"],
  },
  execute: async (
    args: unknown,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult> => {
    const { param } = args as { param: string };

    // ctx provides: issueId, worktreePath, db, hooks, memory
    const issue = await ctx.db.issues.getByExternalId(ctx.issueId);

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

// Register in plugin setup
ctx.orchestrator.registerTool(myTool);
```

### Register Steering Rules

Steering rules provide autonomous guidance to idle agents. See `#workflow/steering` for details:

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "review-reminder",
  name: "Review Reminder",
  description: "Reminds agents to check PR reviews when idle",
  condition: {
    status: ["in_review"],
    hook: ["agent.idle"],
  },
  reminder: "You have a PR awaiting review. Check for new comments.",
  priority: 10,
  once: false,
});
```

### Spawn an Agent

```typescript
const adapter = await orchestrator.spawn({
  issue, // Issue from DB
  repoPath: "/path/to/repo", // Main git repo
  baseBranch: "main", // Base branch for worktree
  harness: "pi-coding-agent", // Adapter to use (optional, uses config default)
  model: "anthropic/claude-sonnet-4", // Model to use (optional)
});

// Start the agent
await adapter.start();

// Send messages
await orchestrator.sendMessage("AM-123", "Please check the failing tests");

// Get agent
const agent = orchestrator.getAgent("AM-123");

// Stop agent
await agent.stop({ removeWorktree: true, deleteBranch: true });
```

### Model Management

```typescript
// Get all models across adapters
const models = orchestrator.getAllModels();
// [{ id: "claude-sonnet-4", name: "Sonnet 4", harness: "pi", provider: "anthropic" }, ...]

// Get models for a specific adapter
const piModels = orchestrator.getModelsForAdapter("pi-coding-agent");

// Get only authenticated/available models
const available = orchestrator.getAvailableModelsForAdapter("pi-coding-agent");

// Find a specific model
const model = orchestrator.findModelInAdapter(
  "pi",
  "anthropic",
  "claude-sonnet-4",
);
```

## Agent Lifecycle

```
         ┌──────────┐
         │  create   │  Factory method: AgentAdapter.create()
         └─────┬─────┘
               │
               ▼
    ┌─────────────────────┐
    │    initialize()     │  Create worktree, build prompt, subscribe to hooks
    └──────────┬──────────┘
               │
               ▼
         ┌──────────┐
         │  start()  │  Sets state → "starting", calls doStart(), → "running"
         └─────┬─────┘
               │
               ▼
    ┌─────────────────────┐
    │     Running          │  Agent processes tasks
    │                      │
    │  • Receives messages │  via sendMessage()
    │  • Calls tools       │  via OrchestratorTool.execute()
    │  • Gets steering     │  via steering.reminder hook
    │  • Gets notifs       │  via notification.created hook
    └──────────┬──────────┘
               │
               ▼
         ┌──────────┐
         │  stop()   │  Sets state → "stopping", calls doStop(), → "stopped"
         └──────────┘
```

### Agent States

| State      | Description                               |
| ---------- | ----------------------------------------- |
| `stopped`  | Agent not running (initial or after stop) |
| `starting` | Agent is initializing                     |
| `running`  | Agent is active and processing            |
| `stopping` | Agent is shutting down                    |
| `crashed`  | Agent failed during startup               |

### AgentAdapter Abstract Methods

Subclasses must implement these methods:

| Method                 | Description                              |
| ---------------------- | ---------------------------------------- |
| `doStart()`            | Harness-specific start logic             |
| `sendMessage(content)` | Send a message to the running agent      |
| `doStop()`             | Harness-specific stop/cleanup logic      |
| `isRunning()`          | Whether the agent is actively processing |

### Static Properties

Each adapter class defines:

| Property      | Description                             |
| ------------- | --------------------------------------- |
| `displayName` | Human-readable name for the harness     |
| `icon`        | Emoji icon for display                  |
| `registry`    | ModelRegistry instance for this harness |

## Built-in Tools

The core plugin (`builtin-tools`) registers three tools available to all agents:

### workhorse_acknowledge

Marks notification(s) as read after the agent processes them.

```typescript
// Acknowledge specific notifications
{
  notificationIds: ["notif-1", "notif-2"];
}

// Acknowledge all unread for current issue
{
}
```

### workhorse_update_status

Updates the current issue's status to reflect progress.

```typescript
{
  status: "implementing";
} // Valid: pending, planning, implementing, blocked, in_review, done
```

### workhorse_escalate

Escalates to a human when blocked or needing clarification.

```typescript
{ message: "Cannot proceed without API credentials", blocking: true }
```

## Hooks Emitted

| Event                  | Payload                 | When                            |
| ---------------------- | ----------------------- | ------------------------------- |
| `agent.create.pre`     | `{ issue, options }`    | Before adapter initialization   |
| `agent.create.post`    | `{ adapter }`           | After adapter initialization    |
| `agent.start.pre`      | `{ adapter }`           | Before agent starts             |
| `agent.start.post`     | `{ adapter }`           | After agent starts successfully |
| `agent.stop.pre`       | `{ adapter }`           | Before agent stops              |
| `agent.stop.post`      | `{ adapter }`           | After agent stops               |
| `agent.idle`           | `{ issueId }`           | Agent becomes idle              |
| `agent.tool_call`      | `{ tool, args }`        | Agent calls a tool              |
| `steering.reminder`    | `{ issueId, reminder }` | Steering rule fires             |
| `issue.status_changed` | `{ issue, from, to }`   | Issue status changes            |

## Types

### OrchestratorTool

```typescript
interface OrchestratorTool {
  /** Unique tool name (e.g., "github_open_pr") */
  name: string;
  /** Description for the agent */
  description: string;
  /** JSON Schema for input parameters */
  schema: Record<string, unknown>;
  /** Execute the tool */
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<ToolResult>;
}
```

### ToolExecutionContext

```typescript
interface ToolExecutionContext {
  /** External ID of the issue */
  issueId: string;
  /** Path to the worktree */
  worktreePath: string;
  /** Database instance */
  db: Database;
  /** Hook emitter */
  hooks: HookEmitter;
  /** Memory service */
  memory: MemoryService;
}
```

### ToolResult

```typescript
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

### ModelInfo

```typescript
interface ModelInfo {
  /** Model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Provider name */
  provider: string;
  /** Model description */
  description?: string;
  /** Whether this is the default model */
  isDefault?: boolean;
}
```

## Files

| File               | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `orchestrator.ts`  | HarnessOrchestrator class — adapter registry, tool registry, agent management |
| `agent.ts`         | AgentAdapter abstract class — lifecycle, worktree, prompt, steering           |
| `registry.ts`      | ModelRegistry abstract class — adapter-specific model discovery               |
| `types/adapter.ts` | Agent types (AgentState, CreateOptions, SpawnOptions, etc.)                   |
| `types/tools.ts`   | Tool types (OrchestratorTool, ToolExecutionContext, ToolResult)               |
| `types/spawn.ts`   | Spawn-related types                                                           |
| `types/index.ts`   | Barrel re-exports                                                             |
| `index.ts`         | Module barrel exports                                                         |
