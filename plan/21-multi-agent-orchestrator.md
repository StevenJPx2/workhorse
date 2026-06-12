# Step 21: Multi-Agent Orchestrator

Rewrite the orchestrator to clearly separate **Workflow** (self-contained, idempotent, TUI-capable) from **Orchestrator** (manages multiple workflows across issues).

**Location:** `packages/core/src/workflow/`

**External deps:** None (builds on existing infrastructure)

## Problem Statement

Currently, the orchestrator manages one agent per issue with a 1:1 lifecycle. When an agent consumes too many tokens or hits context limits:

1. The entire context is lost on restart
2. No graceful handoff mechanism exists
3. Memory compaction happens outside the agent's awareness
4. Long-running issues suffer from context degradation

Additionally, the current `AgentAdapter` is tightly coupled to the "coding agent" use case. We need a more modular architecture where:

- Any agent type can be created through the same adapter system
- Plugins can register custom agent types (review, debug, refactor, etc.)
- Workflows are composed of agents via hooks, not hardcoded sequences

**Critical insight:** The **Workflow** must be completely idempotent and self-contained — runnable with its own TUI if needed. The **Orchestrator** is simply a manager that coordinates multiple workflows.

## Goals

1. **Self-Contained Workflow** — A Workflow can run independently with its own TUI (idempotent, no orchestrator dependency)
2. **Modular AgentAdapter** — Base class that can be extended for any agent type (coding, review, debug, refactor, etc.)
3. **Agent Type Registry** — Plugins register agent types, workflow spawns by type
4. **Workflow Hooks** — Plugins compose multi-agent workflows via hook subscriptions
5. **Token Tracking** — Built into base adapter, triggers hooks for plugins to respond
6. **Continuation Tool** — Allow new agents to query the previous agent's state
7. **Orchestrator as Manager** — Orchestrator manages multiple Workflows, doesn't own their logic

## Design Decisions

| Decision                  | Choice                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| **Workflow independence** | Workflow is self-contained, can run with own TUI (no orchestrator required) |
| **Orchestrator role**     | Manages multiple Workflows, provides cross-workflow coordination            |
| Agent extensibility       | Modular AgentAdapter base class, plugins register types                     |
| Workflow composition      | Hook-driven, not hardcoded sequences                                        |
| Trigger mechanism         | Token count threshold emits hook, plugins decide response                   |
| Handoff data              | Structured summary passed via hooks + L1 context                            |
| Memory persistence        | L1 compaction + L2 semantic indexing (plugin-provided)                      |
| Agent communication       | Shared context.md + continuation tool                                       |

## Architecture

### Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────┐
│                        HarnessOrchestrator                       │
│   Manages multiple workflows, routes messages, coordinates       │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│   │ Workflow A  │ │ Workflow B  │ │ Workflow C  │               │
│   │ (Issue 123) │ │ (Issue 456) │ │ (Issue 789) │               │
│   └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          Workflow                                │
│   Self-contained, idempotent, can run with own TUI               │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ AgentTypeRegistry (local or shared)                       │  │
│   │ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐          │  │
│   │ │ coding  │ │ review  │ │ debug    │ │ ...    │          │  │
│   │ └─────────┘ └─────────┘ └──────────┘ └────────┘          │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ WorkflowState                                             │  │
│   │ - totalTokens: number                                     │  │
│   │ - contextData: unknown                                    │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ workflow.agent (WorkflowAgentController)                  │  │
│   │ - spawn(), sendMessage(), stop()                          │  │
│   │ - current: AgentAdapter | null                            │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ HookEmitter (workflow-scoped or shared)                   │  │
│   │ - workflow.tokens                                         │  │
│   │ - workflow.tokens.threshold                               │  │
│   │ - workflow.tokens.threshold                               │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Current State

```
Issue → AgentAdapter → (runs until completion or stop)
                ↑
        Tightly coupled to "coding agent" use case
        Orchestrator owns all lifecycle logic
```

### Proposed State

```
┌────────────────────────────────────────────────────────────────┐
│ Standalone Workflow (can run independently with own TUI)       │
│                                                                │
│   Workflow.spawn({ type: "coding" })                           │
│              ↓                                                 │
│        AgentAdapter (coding)                                   │
│              │                                                 │
│   hook: workflow.tokens.threshold                              │
│              ↓                                                 │
│   Plugin responds via hook                                     │
│              ↓                                                 │
│   workflow.agent.sendMessage(compactionPrompt)                 │
│              ↓                                                 │
│   workflow.setContextData(summary)                             │
│              ↓                                                 │
│   workflow.agent.spawn({ type: "coding" })  // has contextData
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Orchestrator (optional, for multi-workflow management)         │
│                                                                │
│   orchestrator.startWorkflow(issue) → Workflow instance        │
│   orchestrator.getWorkflow(issueId) → Workflow | undefined     │
│   orchestrator.sendMessage(issueId, msg) → routes to Workflow  │
│   orchestrator.shutdown() → stops all Workflows                │
└────────────────────────────────────────────────────────────────┘
```

**Key insight:** The Workflow is self-contained and owns its agent lifecycle. The Orchestrator is optional — it just manages multiple Workflows and routes messages.

## New Components

### 0. Self-Contained Workflow Class

The Workflow is the core unit — completely idempotent and runnable independently:

```typescript
// workflow/workflow.ts
import type { Issue } from "../db/schema";
import type { HookEmitter } from "../lib/hooks";
import type { Database } from "../db";
import type { MemoryService } from "../services";
import { AgentTypeRegistry } from "./orchestrator/agent-registry";
import type {
  AgentAdapter,
  AgentConfig,
  SpawnOptions,
} from "./orchestrator/types";

export interface WorkflowConfig {
  issue: Issue;
  db: Database;
  hooks: HookEmitter;
  memory: MemoryService;

  /** Optional: shared registry (for orchestrator mode). If not provided, workflow creates its own. */
  registry?: AgentTypeRegistry;

  /** Optional: token threshold for compaction (default: 150,000) */
  tokenThreshold?: number;
}

export interface WorkflowState {
  issueId: string;
  totalTokens: number;
  contextData: unknown | null; // Set by plugins (compaction summary, etc.)
  status: "idle" | "running" | "stopped";
}

/**
 * Self-contained workflow for a single issue.
 *
 * Can run independently with its own TUI — no orchestrator required.
 * The orchestrator is optional and just manages multiple workflows.
 */
export class Workflow {
  readonly state: WorkflowState;
  readonly agent: WorkflowAgentController;
  private readonly registry: AgentTypeRegistry;

  constructor(private readonly config: WorkflowConfig) {
    this.state = {
      issueId: config.issue.id,
      totalTokens: 0,
      contextData: null,
      status: "idle",
    };

    // Use shared registry if provided, otherwise create local one
    this.registry = config.registry ?? new AgentTypeRegistry();

    // Agent controller provides spawn/sendMessage/stop/current
    this.agent = new WorkflowAgentController(this, this.registry, config);

    // Subscribe to token updates from agents
    config.hooks.on("agent.tokens", this.handleTokenUpdate.bind(this));
  }

  /** Issue this workflow is managing */
  get issue(): Issue {
    return this.config.issue;
  }

  /** Register an agent type (local to this workflow if no shared registry) */
  registerAgentType(definition: AgentTypeDefinition): void {
    this.registry.register(definition);
  }

  /** Store context data (called by plugins after compaction) */
  async setContextData(data: unknown): Promise<void> {
    this.state.contextData = data;
  }

  /** Get stored context data */
  getContextData(): unknown | null {
    return this.state.contextData;
  }

  /** Reset token count (called by plugins when starting fresh agent) */
  resetTokens(): void {
    this.state.totalTokens = 0;
  }

  /** Handle token updates from agents */
  private handleTokenUpdate(event: {
    issueId: string;
    totalTokens: number;
  }): void {
    if (event.issueId !== this.state.issueId) return;

    this.state.totalTokens = event.totalTokens;

    // Check threshold and emit hook — plugins decide what to do
    const threshold = this.config.tokenThreshold ?? 150_000;
    if (this.state.totalTokens >= threshold) {
      this.config.hooks.emit("workflow.tokens.threshold", {
        issueId: this.state.issueId,
        totalTokens: this.state.totalTokens,
        threshold,
      });
    }
  }
}

/**
 * Agent operations scoped to a workflow.
 * Access via workflow.agent.*
 */
export class WorkflowAgentController {
  private activeAgent: { type: string; adapter: AgentAdapter } | null = null;

  constructor(
    private readonly workflow: Workflow,
    private readonly registry: AgentTypeRegistry,
    private readonly config: WorkflowConfig,
  ) {}

  /** Get current agent adapter (if running) */
  get current(): AgentAdapter | null {
    return this.activeAgent?.adapter ?? null;
  }

  /** Get current agent type (if running) */
  get currentType(): string | null {
    return this.activeAgent?.type ?? null;
  }

  /** Spawn an agent of the given type */
  async spawn(
    options: Omit<SpawnOptions, "issue"> = {},
  ): Promise<AgentAdapter> {
    const { type = "coding", ...rest } = options;

    // Stop current agent if running
    if (this.activeAgent) {
      await this.activeAgent.adapter.stop();
      this.activeAgent = null;
    }

    // Create adapter via registry
    const adapter = this.registry.createAdapter(type, {
      issue: this.config.issue,
      workflow: this.workflow,
      db: this.config.db,
      hooks: this.config.hooks,
      memory: this.config.memory,
      ...rest,
    });

    // Emit hook — plugins can intercept/modify
    this.config.hooks.emit("workflow.agent.spawn.pre", {
      issueId: this.workflow.state.issueId,
      type,
      adapter,
    });

    await adapter.initialize();

    this.activeAgent = { type, adapter };
    this.workflow.state.status = "running";

    await adapter.start();

    this.config.hooks.emit("workflow.agent.spawn.post", {
      issueId: this.workflow.state.issueId,
      type,
      adapter,
    });

    return adapter;
  }

  /** Send a message to the current agent */
  async sendMessage(content: string): Promise<string> {
    if (!this.activeAgent) {
      throw new Error("No active agent to send message to");
    }
    return this.activeAgent.adapter.sendMessage(content);
  }

  /** Stop the current agent */
  async stop(): Promise<void> {
    if (this.activeAgent) {
      await this.activeAgent.adapter.stop();
      this.activeAgent = null;
    }
    this.workflow.state.status = "stopped";

    this.config.hooks.emit("workflow.agent.stopped", {
      issueId: this.workflow.state.issueId,
    });
  }
}
```

**Usage: Standalone Workflow (no orchestrator)**

```typescript
// Example: Running a workflow independently with its own TUI
import { Workflow } from "@workhorse/core/workflow";
import { PiAgentAdapter } from "@workhorse/pi-adapter";

// Create workflow for a single issue
const workflow = new Workflow({
  issue: myIssue,
  db,
  hooks: createHookEmitter(),
  memory,
});

// Register agent types
workflow.registerAgentType({
  type: "coding",
  name: "Pi Coding Agent",
  createAdapter: (config) => new PiAgentAdapter(config),
});

// Start an agent
await workflow.agent.spawn({ type: "coding" });

// Send messages
await workflow.agent.sendMessage(
  "Implement the feature described in the issue",
);

// Check current agent
console.log(workflow.agent.current); // AgentAdapter
console.log(workflow.agent.currentType); // "coding"

// Stop when done
await workflow.agent.stop();
```

**Usage: With Orchestrator (multi-workflow)**

```typescript
// Example: Orchestrator managing multiple workflows
const orchestrator = new HarnessOrchestrator({ db, hooks, memory, config });

// Start workflow for issue (orchestrator creates Workflow internally)
const workflow = await orchestrator.startWorkflow(issue);

// Orchestrator routes messages to the right workflow
await orchestrator.sendMessage(issue.id, "Continue with the implementation");

// Get workflow state
const state = orchestrator.getWorkflow(issue.id)?.state;
```

### 1. Modular AgentAdapter Base Class

The key insight is that `AgentAdapter` should be a minimal, extensible base that any agent type can build on:

```typescript
// workflow/orchestrator/agent-adapter.ts
import type { Issue } from "../../db/schema";
import type { AgentType, AgentConfig } from "./types";

/**
 * Base interface for all agent types.
 * Plugins extend this to create specialized agents.
 */
export interface AgentTypeDefinition {
  /** Unique identifier for this agent type */
  type: string;

  /** Human-readable name */
  name: string;

  /** What this agent does */
  description: string;

  /**
   * Factory to create the adapter instance.
   * Receives the base config + any type-specific config.
   */
  createAdapter: (config: AgentConfig) => AgentAdapter;

  /**
   * Optional: Default system prompt for this agent type.
   * Can be overridden per-instance.
   */
  defaultSystemPrompt?: string;

  /**
   * Optional: Tools this agent type should have access to.
   * In addition to any tools passed at spawn time.
   */
  defaultTools?: string[];

  /**
   * Optional: Model preference for this agent type.
   * e.g., "fast" for lightweight agents, "capable" for coding
   */
  modelPreference?: "fast" | "capable" | "cheap";
}

/**
 * Minimal base class — subclasses implement the specifics.
 */
export abstract class AgentAdapter {
  readonly issueId: string;
  readonly type: string;

  protected tokenCount = 0;
  protected state: "idle" | "running" | "stopped" = "idle";

  constructor(
    protected config: AgentConfig,
    protected typeDefinition: AgentTypeDefinition,
  ) {
    this.issueId = config.issue.id;
    this.type = typeDefinition.type;
  }

  /** Lifecycle: initialize resources */
  abstract initialize(): Promise<void>;

  /** Lifecycle: start execution */
  abstract start(): Promise<void>;

  /** Lifecycle: send a message to the running agent */
  abstract sendMessage(content: string): Promise<void>;

  /** Lifecycle: stop execution */
  abstract stop(): Promise<void>;

  /** Token tracking — subclasses call this after each turn */
  protected async trackTokens(input: number, output: number): Promise<void> {
    this.tokenCount += input + output;

    hooks.emit("agent.tokens", {
      issueId: this.issueId,
      type: this.type,
      inputTokens: input,
      outputTokens: output,
      totalTokens: this.tokenCount,
    });
  }

  /** Check if running */
  isRunning(): boolean {
    return this.state === "running";
  }

  /** Get current token count */
  getTokenCount(): number {
    return this.tokenCount;
  }
}
```

### 2. Agent Type Registry

Plugins register agent types, orchestrator spawns by type:

```typescript
// workflow/orchestrator/agent-registry.ts
export class AgentTypeRegistry {
  private types = new Map<string, AgentTypeDefinition>();

  /**
   * Register an agent type. Called by plugins during setup.
   */
  register(definition: AgentTypeDefinition): void {
    if (this.types.has(definition.type)) {
      throw new Error(`Agent type "${definition.type}" already registered`);
    }
    this.types.set(definition.type, definition);

    hooks.emit("agent.type.registered", {
      type: definition.type,
      name: definition.name,
    });
  }

  /**
   * Get a registered agent type definition.
   */
  get(type: string): AgentTypeDefinition | undefined {
    return this.types.get(type);
  }

  /**
   * List all registered agent types.
   */
  list(): AgentTypeDefinition[] {
    return [...this.types.values()];
  }

  /**
   * Create an adapter instance for a given type.
   */
  createAdapter(type: string, config: AgentConfig): AgentAdapter {
    const definition = this.types.get(type);
    if (!definition) {
      throw new Error(
        `Unknown agent type: "${type}". Available: ${[...this.types.keys()].join(", ")}`,
      );
    }
    return definition.createAdapter(config);
  }
}
```

### 3. HarnessOrchestrator as Workflow Manager

The orchestrator manages multiple Workflows — it doesn't own agent logic, just coordinates:

```typescript
// workflow/orchestrator/harness-orchestrator.ts (updated)
import { Workflow, type WorkflowConfig } from "../workflow";
import { AgentTypeRegistry } from "./agent-registry";

export class HarnessOrchestrator {
  /** Shared registry for all workflows (plugins register here) */
  private readonly registry = new AgentTypeRegistry();

  /** Active workflows by issue ID */
  private readonly workflows = new Map<string, Workflow>();

  constructor(
    readonly db: Database,
    readonly hooks: HookEmitter,
    readonly memory: MemoryService,
    readonly config: Readonly<WorkhorseConfig>,
  ) {}

  /**
   * Register an agent type. Used by plugins.
   * Types registered here are available to all workflows.
   */
  registerAgentType(definition: AgentTypeDefinition): void {
    this.registry.register(definition);
  }

  /**
   * Start a workflow for an issue.
   * Creates new Workflow if not exists, returns existing if already running.
   */
  async startWorkflow(issue: Issue): Promise<Workflow> {
    let workflow = this.workflows.get(issue.id);

    if (!workflow) {
      workflow = new Workflow({
        issue,
        db: this.db,
        hooks: this.hooks,
        memory: this.memory,
        registry: this.registry, // Share registry across all workflows
        tokenThreshold: this.config.workflow?.tokenThreshold,
      });

      this.workflows.set(issue.id, workflow);

      this.hooks.emit("orchestrator.workflow.created", {
        issueId: issue.id,
      });
    }

    return workflow;
  }

  /**
   * Spawn an agent in a workflow. Creates workflow if not exists.
   * Convenience method that combines startWorkflow + workflow.spawn.
   */
  async spawn(options: SpawnOptions): Promise<AgentAdapter> {
    const { issue, ...rest } = options;
    const workflow = await this.startWorkflow(issue);
    return workflow.spawn(rest);
  }

  /**
   * Send a message to a running workflow.
   */
  async sendMessage(issueId: string, content: string): Promise<void> {
    const workflow = this.workflows.get(issueId);
    if (!workflow) {
      throw new Error(`No workflow found for issue: ${issueId}`);
    }
    await workflow.sendMessage(content);
  }

  /**
   * Get workflow for an issue.
   */
  getWorkflow(issueId: string): Workflow | undefined {
    return this.workflows.get(issueId);
  }

  /**
   * Get all active workflows.
   */
  getAllWorkflows(): Workflow[] {
    return [...this.workflows.values()];
  }

  /**
   * Stop and remove a workflow.
   */
  async stopWorkflow(issueId: string): Promise<void> {
    const workflow = this.workflows.get(issueId);
    if (workflow) {
      await workflow.stop();
      this.workflows.delete(issueId);

      this.hooks.emit("orchestrator.workflow.stopped", {
        issueId,
      });
    }
  }

  /**
   * Shutdown all workflows.
   */
  async shutdown(): Promise<void> {
    const stopPromises = [...this.workflows.keys()].map((id) =>
      this.stopWorkflow(id),
    );
    await Promise.all(stopPromises);
  }
}
```

### 4. Core Primitives for Token Threshold Handling

The core Workflow provides **primitives only** — it doesn't prescribe what to do when tokens are high. Plugins compose these primitives into behaviors.

**Core primitives:**

| Primitive                            | Description                                   |
| ------------------------------------ | --------------------------------------------- |
| `workflow.tokens.threshold` hook     | Emitted when token count exceeds threshold    |
| `workflow.agent.spawn({ type })`     | Spawn a new agent                             |
| `workflow.agent.sendMessage(prompt)` | Send a message to current agent, get response |
| `workflow.agent.stop()`              | Stop current agent                            |
| `workflow.agent.current`             | Get current agent adapter (if running)        |
| `workflow.setContextData(data)`      | Store arbitrary context for next agent        |
| `workflow.getContextData()`          | Retrieve stored context                       |
| `workflow.resetTokens()`             | Reset token counter                           |

**The core does NOT:**

- Know about "compaction" or "handoff"
- Prescribe what happens at threshold
- Require any specific agent types

### 5. Builtin Plugin: Self-Compaction Strategy

The builtin plugin implements **one strategy** for handling token thresholds: ask the current agent to summarize, then spawn a fresh agent.

Other plugins can implement different strategies:

- Spawn a separate summarizer agent
- Just restart without compaction
- Save to external storage and continue later
- Escalate to human

```typescript
// packages/core/src/plugins/builtin/workflow/compaction.ts
import { useWorkhorse } from "../../../context";

const COMPACTION_PROMPT = `
You are about to be replaced by a fresh agent due to token limits.
Provide a structured summary for the next agent:

1. **Goals Completed** — What was accomplished
2. **Goals Remaining** — What still needs to be done  
3. **Current State** — Where things are right now
4. **Key Decisions** — Important decisions made and why
5. **Files Modified** — List of changed files
6. **Blockers** — Any issues preventing progress
7. **Next Steps** — Immediate actions for the next agent

Output as JSON.
`;

export function registerCompactionHandler(): void {
  const { orchestrator, hooks, memory } = useWorkhorse();

  hooks.on("workflow.tokens.threshold", async ({ issueId }) => {
    const workflow = orchestrator.getWorkflow(issueId);
    if (!workflow?.agent.current) return;

    // Ask current agent to summarize
    const response = await workflow.agent.sendMessage(COMPACTION_PROMPT);
    const summary = extractJsonFromResponse(response);

    // Store for next agent
    await workflow.setContextData(summary);

    // Stop current agent
    await workflow.agent.stop();

    // Emit for other plugins (e.g., memory extraction)
    hooks.emit("builtin.compaction.completed", { issueId, summary });

    // Spawn fresh agent
    workflow.resetTokens();
    await workflow.agent.spawn({ type: "coding" });
  });

  // Background memory extraction (optional)
  hooks.on("builtin.compaction.completed", async ({ issueId, summary }) => {
    await memory.extractAndIndex(issueId, summary);
  });
}
```

**Plugin registration:**

```typescript
// packages/core/src/plugins/builtin/plugin.ts
import { registerCompactionHandler } from "./workflow/compaction";

export const builtinPlugin = definePlugin({
  manifest: {
    name: "builtin",
    version: "1.0.0",
    capabilities: {
      tools: [
        "workhorse_acknowledge",
        "workhorse_update_status",
        "workhorse_escalate",
      ],
    },
  },
  setup() {
    registerBuiltinTools();
    registerBuiltinSteering();
    registerCompactionHandler();
  },
});
```

### 6. Custom Plugin Example: External Memory Strategy

A different plugin could handle the threshold differently:

```typescript
// Example: workhorse-plugin-external-memory
export default definePlugin({
  manifest: { name: "external-memory", version: "1.0.0" },

  setup() {
    const { orchestrator, hooks } = useWorkhorse();

    hooks.on("workflow.tokens.threshold", async ({ issueId }) => {
      const workflow = orchestrator.getWorkflow(issueId);
      if (!workflow?.agent.current) return;

      // Different strategy: save full conversation to external service
      const messages = await db.messages.findByIssueId(issueId);
      await externalMemoryService.save(issueId, messages);

      // Stop and restart without in-context summary
      await workflow.agent.stop();
      workflow.resetTokens();

      // New agent queries external memory as needed
      await workflow.agent.spawn({
        type: "coding",
        tools: [externalMemoryQueryTool],
      });
    });
  },
});
```

### 7. Custom Plugin Example: Handoff Agent Strategy

Another plugin might prefer a separate agent for summarization:

```typescript
// Example: workhorse-plugin-handoff-agent
export default definePlugin({
  manifest: {
    name: "handoff-agent",
    version: "1.0.0",
    capabilities: { agentTypes: ["handoff"] },
  },

  setup() {
    const { orchestrator, hooks } = useWorkhorse();

    // Register specialized handoff agent type
    orchestrator.registerAgentType({
      type: "handoff",
      name: "Handoff Agent",
      modelPreference: "fast",
      createAdapter: (config) => new HandoffAgentAdapter(config),
    });

    hooks.on("workflow.tokens.threshold", async ({ issueId }) => {
      const workflow = orchestrator.getWorkflow(issueId);
      if (!workflow) return;

      // Stop coding agent, spawn handoff agent
      await workflow.agent.stop();
      await workflow.agent.spawn({ type: "handoff" });
    });

    hooks.on("handoff.agent.completed", async ({ issueId, summary }) => {
      const workflow = orchestrator.getWorkflow(issueId);
      if (!workflow) return;

      await workflow.setContextData(summary);
      workflow.resetTokens();
      await workflow.agent.spawn({ type: "coding" });
    });
  },
});
```

**Key insight:** The core provides primitives. Plugins compose them into strategies. The builtin plugin ships with a sensible default (self-compaction), but it's not special — any plugin can override or extend it.

### 8. Existing Harness Adapters as Agent Types

Current harness adapters (Pi, Claude Code, Opencode) migrate to the new registry system:

```typescript
// Example: packages/plugins/pi-adapter/src/index.ts (updated)
export default definePlugin({
  manifest: {
    name: "pi-adapter",
    version: "2.0.0",
    capabilities: {
      agentTypes: ["coding"], // Or "pi-coding" if we want multiple coding agents
    },
  },

  setup() {
    const { orchestrator } = useWorkhorse();

    // Register as the default "coding" agent type
    orchestrator.registerAgentType({
      type: "coding",
      name: "Pi Coding Agent",
      description: "Full-featured coding agent powered by Pi SDK",
      modelPreference: "capable",
      createAdapter: (config) => new PiAgentAdapter(config),
    });

    // Or register as a specific type, allowing multiple coding adapters
    // orchestrator.registerAgentType({
    //   type: "pi-coding",
    //   ...
    // });
  },
});
```

```typescript
// Explicit harness selection
await orchestrator.spawn({
  issue,
  type: "pi-coding", // or "claude-code", "opencode"
});
```

### 9. Custom Workflow Example: Review Agent

Plugins can create any agent type for custom workflows:

```typescript
// Example: workhorse-plugin-review
export default definePlugin({
  manifest: {
    name: "review-agent",
    version: "1.0.0",
    capabilities: {
      agentTypes: ["review"],
    },
  },

  setup() {
    const { orchestrator, hooks } = useWorkhorse();

    // Register review agent type
    orchestrator.registerAgentType({
      type: "review",
      name: "Code Review Agent",
      description: "Reviews code changes and provides feedback",
      modelPreference: "capable",
      defaultSystemPrompt: REVIEW_SYSTEM_PROMPT,
      defaultTools: ["github_get_pr_diff", "github_add_review"],
      createAdapter: (config) => new ReviewAgentAdapter(config),
    });

    // Auto-spawn review agent when PR is ready
    hooks.on("github.pr.ready_for_review", async ({ issueId, prNumber }) => {
      const issue = await db.issues.findById(issueId);
      await orchestrator.spawn({
        issue,
        type: "review",
        context: { prNumber },
      });
    });
  },
});
```

### 10. Continuation Tool

Tool for new agents to query previous agent's work (registered by core):

```typescript
// workflow/orchestrator/tools/continuation.ts
export const continuationTool: OrchestratorTool = {
  name: "workhorse_continuation",
  description: `Query the previous agent's compaction summary. Use this at the start of your session to understand what was accomplished and what needs to be done next.`,
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Specific question about the previous agent's work",
      },
    },
  },
  execute: async (args, ctx) => {
    const workflow = orchestrator.getWorkflow(ctx.issueId);
    const contextData = workflow?.state.contextData;

    if (!contextData) {
      return {
        success: true,
        output: "No previous agent session found. This is a fresh start.",
      };
    }

    // If specific query, use L2 search
    if (args.query) {
      const relevant = await memory.l2.search(args.query, {
        issueId: ctx.issueId,
        limit: 5,
      });
      return { success: true, output: formatSearchResults(relevant) };
    }

    // Return full compaction summary
    return {
      success: true,
      output: formatContextData(contextData),
    };
  },
};
```

## Extended AgentAdapter

Token tracking is built into the base class. Workflow responds to token hooks:

```typescript
// workflow/orchestrator/agent-adapter.ts (additions)
export abstract class AgentAdapter {
  protected workflow?: Workflow;
  protected tokenCount = 0;

  /** Called by subclasses after each turn to track token usage */
  protected async trackTokens(
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    this.tokenCount += inputTokens + outputTokens;

    // Emit hook — Workflow listens and checks threshold
    this.hooks.emit("agent.tokens", {
      issueId: this.issueId,
      inputTokens,
      outputTokens,
      totalTokens: this.tokenCount,
    });
  }

  /** Get current token count */
  getTokenCount(): number {
    return this.tokenCount;
  }
}
```

## Workflow Configuration

```toml
[workflow]
enabled = true
token_threshold = 150000    # Trigger self-compaction at 150k tokens
memory_extraction = true    # Extract learnings to L2 after compaction
```

## Hooks

New hooks for workflow events:

```typescript
// lib/hooks/types.ts (additions)
export interface HookEvents {
  // ... existing hooks

  // === CORE WORKFLOW HOOKS (emitted by Workflow class) ===
  "workflow.tokens.threshold": {
    issueId: string;
    totalTokens: number;
    threshold: number;
  };
  "workflow.stopped": { issueId: string };
  "workflow.agent.spawn.pre": {
    issueId: string;
    type: string;
    adapter: AgentAdapter;
  };
  "workflow.agent.spawn.post": {
    issueId: string;
    type: string;
    adapter: AgentAdapter;
  };

  // === ORCHESTRATOR HOOKS ===
  "orchestrator.workflow.created": { issueId: string };
  "orchestrator.workflow.stopped": { issueId: string };

  // === AGENT HOOKS (emitted by AgentAdapter subclasses) ===
  "agent.tokens": {
    issueId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  // === PLUGIN HOOKS (emitted by builtin compaction handler) ===
  "workflow.compaction.completed": { issueId: string; summary: unknown };
}
```

**Key insight:** Core only emits `workflow.tokens.threshold`. The self-compaction flow is handled by the builtin plugin — no separate agents needed.

## L1 Context Extensions

Extend context.md format to include compaction summary:

```markdown
<!-- context.md -->

# Issue: AM-123

## Handoff Summary

- **Goals Completed:** Authentication flow, user model
- **Goals Remaining:** Authorization middleware, tests
- **Blockers:** None
- **Next Steps:** Implement role-based access control
- **Key Decisions:** Used JWT for stateless auth, chose bcrypt for password hashing
- **Files Modified:** src/auth/\*, src/models/user.ts

## Session Log

...current session entries...
```

## File Structure

```
packages/core/src/workflow/
├── workflow.ts             # NEW: Self-contained Workflow class (TUI-capable)
├── index.ts                # Re-exports Workflow + orchestrator
│
├── orchestrator/
│   ├── agent-adapter.ts        # Modular base class with token tracking
│   ├── agent-registry.ts       # NEW: Agent type registry
│   ├── harness-orchestrator.ts # Workflow manager (delegates to Workflow instances)
│   ├── tools/
│   │   ├── continuation.ts     # NEW: Query previous agent
│   │   └── ... existing tools
│   └── types.ts                # Extended types (AgentTypeDefinition, WorkflowConfig, etc.)
│
└── ... existing (tracker/, steering/)

packages/core/src/plugins/builtin/
├── workflow/
│   └── compaction.ts                 # Token threshold handler (self-compaction)
├── tools/                            # Existing
├── steering.ts                       # Existing
└── plugin.ts                         # Updated to call registerCompactionHandler()
```

**Key insight:** The `Workflow` class is at the top level of the workflow directory because it's the primary abstraction. The orchestrator is just one way to manage workflows.

## Migration Path

1. **Phase 1:** Create `Workflow` class — self-contained, TUI-capable
2. **Phase 2:** Refactor AgentAdapter to modular base class
3. **Phase 3:** Implement AgentTypeRegistry + `registerAgentType()` API
4. **Phase 4:** Rewrite HarnessOrchestrator to manage Workflow instances
5. **Phase 5:** Add token tracking + workflow hooks
6. **Phase 6:** Create builtin compaction handler (self-compaction via current agent)
7. **Phase 7:** Add continuation tool to core
8. **Phase 8:** Enable by default for long-running issues

## Tasks

### Core Infrastructure

- [ ] Create `Workflow` class — self-contained, TUI-capable, idempotent
- [ ] Implement `WorkflowState` interface with tokens, activeAgent, contextData
- [ ] Implement `WorkflowAgentController` with `spawn()`, `sendMessage()`, `stop()`, `current`
- [ ] Implement `Workflow.setContextData()`, `getContextData()`, `resetTokens()`
- [ ] Refactor `AgentAdapter` to minimal, extensible base class
- [ ] Implement `AgentTypeRegistry` for plugin-registered agent types
- [ ] Update `HarnessOrchestrator` to manage `Workflow` instances (not agents directly)
- [ ] Add `orchestrator.startWorkflow()`, `getWorkflow()`, `stopWorkflow()` APIs
- [ ] Add token tracking to base adapter with `agent.tokens` hook
- [ ] Add workflow hooks (`workflow.tokens.threshold`, `workflow.agent.spawn.pre/post`, etc.)
- [ ] Add workflow configuration schema
- [ ] Implement `workhorse_continuation` tool
- [ ] Add tests for standalone Workflow usage (no orchestrator)

### Builtin Plugin: Self-Compaction Handler

- [ ] Create `packages/core/src/plugins/builtin/workflow/compaction.ts`
- [ ] Implement `registerCompactionHandler()` function
- [ ] Subscribe to `workflow.tokens.threshold` hook
- [ ] Send compaction prompt via `currentAgent.adapter.sendMessage()`
- [ ] Store summary via `workflow.setContextData()`
- [ ] Emit `workflow.compaction.completed` for background memory extraction
- [ ] Stop current agent and spawn fresh coding agent
- [ ] Update `plugin.ts` to call `registerCompactionHandler()`

### Integration

- [ ] Update existing harness plugins (pi-adapter, etc.) to use `registerAgentType()`
- [ ] Extend L1 context.md format to include compaction summary
- [ ] Write tests for workflow transitions
- [ ] Write tests for agent type registry
- [ ] Update PROGRESS.md

## Sub-Agents with Scoped Capabilities

Sub-agents are child agents spawned by the current agent to handle specific subtasks. They run in a **sandbox** with restricted capabilities.

### Design Principles

1. **Capability-based security** — Sub-agent only gets tools/permissions explicitly granted
2. **Path scoping** — Read/write restricted to specific directories
3. **Resource limits** — Token budget, turn limit, timeout
4. **No state mutation** — Can't modify workflow state, only return results
5. **Stack-based** — Parent waits for child, resumes with result

### API

```typescript
// WorkflowAgentController additions
export class WorkflowAgentController {
  // ... existing methods ...

  /**
   * Spawn scoped sub-agents.
   * - mode: "eager" (default) — parent waits for result
   * - mode: "background" — returns immediately, notifies on completion
   */
  async spawnChildren(options: SubAgentOptions[]): Promise<SubAgentResult[]>;

  /**
   * Get result of a completed background sub-agent by ID.
   * Call this after receiving completion notification.
   */
  getChildResult(id: string): SubAgentResult | undefined;

  /** Current agent depth (0 = root, 1 = child, etc.) */
  get depth(): number;

  /** Parent agent (if this is a sub-agent) */
  get parent(): AgentAdapter | null;
}

export interface SubAgentOptions {
  /**
   * Unique ID for this sub-agent.
   * Required for background mode (to retrieve results later).
   */
  id?: string;

  /** Agent type to spawn */
  type: string;

  /** Task description for the sub-agent */
  task: string;

  /**
   * Execution mode:
   * - "eager" (default): Parent waits for result
   * - "background": Returns immediately, sends notification on completion
   */
  mode?: "eager" | "background";

  /**
   * Tools with their scopes. Each tool defines its own scope schema.
   * The plugin that provides the tool is responsible for enforcing the scope.
   */
  tools?: ScopedTool[];

  /** Resource limits */
  limits?: {
    /** Max tokens for sub-agent context */
    maxTokens?: number;
    /** Max conversation turns */
    maxTurns?: number;
    /** Timeout in milliseconds */
    timeout?: number;
  };

  /** Context to pass to sub-agent */
  context?: unknown;
}

/**
 * A tool with scope restrictions.
 * The scope schema is defined by the tool/plugin itself.
 */
export interface ScopedTool {
  /** Tool name */
  name: string;

  /**
   * Scope values for this tool.
   * Schema depends on what the tool declares it accepts.
   * Examples:
   *   - read tool: { paths: ["src/auth/**"] }
   *   - write tool: { paths: ["src/auth/**"], allowCreate: false }
   *   - git tool: { operations: ["status", "diff"] }
   *   - script tool: { scripts: ["test", "lint"] }
   */
  scope?: Record<string, unknown>;
}

export interface SubAgentResult {
  /** ID of the sub-agent (matches SubAgentOptions.id) */
  id: string;
  /**
   * Execution mode this result came from:
   * - "eager": Result returned inline from spawnChildren()
   * - "background": Result retrieved via getChildResult() after notification
   */
  mode: "eager" | "background";
  /** Whether the sub-agent completed successfully */
  success: boolean;
  /** Output from the sub-agent */
  output: unknown;
  /** Error if failed */
  error?: string;
  /** Tokens consumed */
  tokensUsed: number;
}
```

### Tool Scope Definition (Plugin Side)

Plugins define tools with their scope schema. The tool is responsible for validating and enforcing its own scope:

```typescript
// Example: Pi adapter defines read tool with scope schema
// packages/plugins/pi-adapter/src/tools/read.ts

import { z } from "zod";

/** Scope schema for the read tool */
export const ReadScopeSchema = z
  .object({
    /** Glob patterns for allowed paths */
    paths: z.array(z.string()).optional(),
  })
  .optional();

export type ReadScope = z.infer<typeof ReadScopeSchema>;

export const readTool: OrchestratorTool = {
  name: "read",
  description: "Read file contents",

  /** Declare what scope parameters this tool accepts */
  scopeSchema: ReadScopeSchema,

  execute: async (args, ctx) => {
    const { path } = args;
    const scope = ctx.scope as ReadScope;

    // Tool enforces its own scope
    if (scope?.paths) {
      const allowed = scope.paths.some((pattern) => minimatch(path, pattern));
      if (!allowed) {
        return {
          success: false,
          error: `Path "${path}" is outside allowed scope. Allowed: ${scope.paths.join(", ")}`,
        };
      }
    }

    // Proceed with read
    return readFile(path);
  },
};

// Example: write tool with more complex scope
export const WriteScopeSchema = z
  .object({
    paths: z.array(z.string()).optional(),
    allowCreate: z.boolean().optional(),
    allowDelete: z.boolean().optional(),
  })
  .optional();

export const writeTool: OrchestratorTool = {
  name: "write",
  scopeSchema: WriteScopeSchema,
  execute: async (args, ctx) => {
    const scope = ctx.scope as z.infer<typeof WriteScopeSchema>;

    // Check path restriction
    if (scope?.paths && !matchesAny(args.path, scope.paths)) {
      return { success: false, error: "Path outside allowed scope" };
    }

    // Check create restriction
    if (!scope?.allowCreate && !fileExists(args.path)) {
      return {
        success: false,
        error: "Creating new files not allowed in this scope",
      };
    }

    // Proceed
    return writeFile(args.path, args.content);
  },
};

// Example: git tool with operation restrictions
export const GitScopeSchema = z
  .object({
    operations: z
      .array(
        z.enum([
          "status",
          "diff",
          "log", // read-only
          "add",
          "commit",
          "branch", // local mutations
          "push",
          "pull",
          "fetch", // remote operations
        ]),
      )
      .optional(),
  })
  .optional();

export const gitTool: OrchestratorTool = {
  name: "git",
  scopeSchema: GitScopeSchema,
  execute: async (args, ctx) => {
    const scope = ctx.scope as z.infer<typeof GitScopeSchema>;

    if (scope?.operations && !scope.operations.includes(args.action)) {
      return {
        success: false,
        error: `Git operation "${args.action}" not allowed. Allowed: ${scope.operations.join(", ")}`,
      };
    }

    return executeGit(args);
  },
};

// Example: script tool with script name restrictions
export const ScriptScopeSchema = z
  .object({
    scripts: z.array(z.string()).optional(), // Allowed script names
  })
  .optional();

export const scriptTool: OrchestratorTool = {
  name: "script",
  scopeSchema: ScriptScopeSchema,
  execute: async (args, ctx) => {
    const scope = ctx.scope as z.infer<typeof ScriptScopeSchema>;

    if (scope?.scripts && !scope.scripts.includes(args.name)) {
      return {
        success: false,
        error: `Script "${args.name}" not allowed. Allowed: ${scope.scripts.join(", ")}`,
      };
    }

    return runScript(args.name, args.args);
  },
};
```

````

### Sub-Agent Tool

The parent agent spawns sub-agents via a tool. Each sub-agent specifies its mode:

- **`mode: "eager"`** (default) — Parent waits, result returned inline
- **`mode: "background"`** — Returns immediately, notification sent on completion

```typescript
// packages/plugins/pi-adapter/src/tools/subagent.ts
export const spawnSubagentsTool: OrchestratorTool = {
  name: "spawn_subagents",
  description: `Spawn one or more sub-agents to handle specific tasks.

Per-agent modes:
- mode: "eager" (default) — Wait for result, returned inline
- mode: "background" — Return immediately, notification sent when done

Background agents send a notification with their ID when complete.
Use get_subagent_result to retrieve the result after notification.

Use for: research, analysis, scoped refactoring, parallel tasks.`,

  schema: {
    type: "object",
    properties: {
      agents: {
        type: "array",
        description: "Sub-agents to spawn",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique ID for this sub-agent (required for background mode)",
            },
            type: {
              type: "string",
              description: "Agent type (e.g., 'research', 'refactor')"
            },
            task: {
              type: "string",
              description: "Task description for the sub-agent"
            },
            mode: {
              type: "string",
              enum: ["eager", "background"],
              description: "eager = wait for result, background = return immediately",
              default: "eager",
            },
            tools: {
              type: "array",
              description: "Tools available to sub-agent with optional scopes",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  scope: { type: "object" },
                },
                required: ["name"],
              },
            },
            limits: {
              type: "object",
              properties: {
                maxTokens: { type: "number" },
                maxTurns: { type: "number" },
                timeout: { type: "number" },
              },
            },
          },
          required: ["type", "task"],
        },
      },
    },
    required: ["agents"],
  },

  execute: async (args, ctx) => {
    const results = await ctx.workflow.agent.spawnChildren(args.agents);
    return {
      success: results.filter(r => r.mode === "eager").every(r => r.success),
      results: results.map(r => ({
        id: r.id,
        mode: r.mode,
        // Eager results have full data, background just confirms spawned
        ...(r.mode === "eager"
          ? { success: r.success, output: r.output, error: r.error, tokensUsed: r.tokensUsed }
          : { status: "running" }
        ),
      })),
    };
  },
};

export const getSubagentResultTool: OrchestratorTool = {
  name: "get_subagent_result",
  description: "Get result of a completed background sub-agent. Call after receiving completion notification.",

  schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Sub-agent ID from the completion notification",
      },
    },
    required: ["id"],
  },

  execute: async (args, ctx) => {
    const result = ctx.workflow.agent.getChildResult(args.id);
    if (!result) {
      return { success: false, error: `No result found for sub-agent "${args.id}"` };
    }
    return {
      success: result.success,
      id: result.id,
      mode: result.mode,
      output: result.output,
      error: result.error,
      tokensUsed: result.tokensUsed,
    };
  },
};
````

### Notification Integration

When a background sub-agent completes, a notification is sent to the parent agent:

```typescript
// In WorkflowAgentController.spawnChildren()
for (const child of backgroundChildren) {
  child.runToCompletion().then((result) => {
    // Store result for retrieval
    this.completedChildren.set(child.id, result);

    // Send notification to parent agent
    this.config.hooks.emit("agent.notification", {
      issueId: this.workflow.state.issueId,
      type: "subagent.completed",
      message: `Sub-agent "${child.id}" completed`,
      data: { id: child.id, success: result.success },
    });
  });
}
```

The notification appears in the agent's context, prompting it to retrieve the result.

### Agent Usage Examples

**Agent spawns a research sub-agent:**

```
User: Analyze the auth module for security issues

Agent: I'll spawn a research sub-agent to analyze the auth module.

<tool_call>
spawn_subagents({
  agents: [{
    type: "research",
    task: "Analyze the authentication flow and identify security concerns",
    tools: [
      { name: "read", scope: { paths: ["src/auth/**"] } },
      { name: "grep", scope: { paths: ["src/auth/**"] } },
      { name: "outline" }
    ],
    limits: { maxTokens: 30000, maxTurns: 5 }
  }]
})
</tool_call>

Tool result: {
  success: true,
  results: [{
    success: true,
    output: {
      concerns: ["Password hashing uses MD5", "No rate limiting on login"],
      recommendations: ["Switch to bcrypt", "Add rate limiting middleware"]
    },
    tokensUsed: 12500
  }]
}

Agent: The analysis found two security concerns:
1. Password hashing uses MD5 (should use bcrypt)
2. No rate limiting on login endpoint
```

**Agent spawns parallel research sub-agents:**

```
User: I need a comprehensive analysis of this codebase

Agent: I'll spawn multiple research sub-agents in parallel.

<tool_call>
spawn_subagents({
  agents: [
    {
      type: "research",
      task: "Analyze API surface and endpoints",
      tools: [{ name: "read", scope: { paths: ["src/api/**"] } }]
    },
    {
      type: "research",
      task: "Analyze test coverage gaps",
      tools: [
        { name: "read", scope: { paths: ["tests/**", "src/**"] } },
        { name: "script", scope: { scripts: ["test:coverage"] } }
      ]
    },
    {
      type: "research",
      task: "Check for outdated dependencies",
      tools: [{ name: "read", scope: { paths: ["package.json", "package-lock.json"] } }]
    }
  ]
})
</tool_call>

Tool result: {
  success: true,
  results: [
    { success: true, output: { endpoints: 12, undocumented: 3 }, tokensUsed: 8000 },
    { success: true, output: { coverage: "72%", gaps: ["auth/*", "utils/*"] }, tokensUsed: 15000 },
    { success: true, output: { outdated: ["lodash", "express"] }, tokensUsed: 5000 }
  ]
}
```

**Agent delegates scoped refactoring:**

```
User: Extract the validation logic from auth.ts into its own module

Agent: I'll spawn a refactor sub-agent with write access only to the validation directory.

<tool_call>
spawn_subagents({
  agents: [{
    type: "refactor",
    task: "Extract validation logic from src/auth/auth.ts into src/auth/validation/",
    tools: [
      { name: "read", scope: { paths: ["src/auth/**"] } },
      { name: "write", scope: { paths: ["src/auth/validation/**"], allowCreate: true } },
      { name: "grep", scope: { paths: ["src/auth/**"] } }
    ],
    limits: { maxTokens: 50000, maxTurns: 15 }
  }]
})
</tool_call>
```

**Background sub-agents (notification-based):**

```
User: Analyze the codebase while I continue working on the auth module

Agent: I'll spawn research agents in background and continue with your task.

<tool_call>
spawn_subagents({
  agents: [
    { id: "api-analysis", type: "research", task: "Analyze API endpoints", mode: "background", tools: [...] },
    { id: "test-coverage", type: "research", task: "Analyze test coverage", mode: "background", tools: [...] },
    { id: "deps-audit", type: "research", task: "Audit dependencies", mode: "background", tools: [...] }
  ]
})
</tool_call>

Tool result: {
  success: true,
  results: [
    { id: "api-analysis", mode: "background", status: "running" },
    { id: "test-coverage", mode: "background", status: "running" },
    { id: "deps-audit", mode: "background", status: "running" }
  ]
}

Agent: Background agents are running. I'll continue with the auth module.
Let me read the current auth implementation...

<tool_call>read({ path: "src/auth/auth.ts" })</tool_call>

... (agent continues working) ...

--- NOTIFICATION: Sub-agent "api-analysis" completed ---
--- NOTIFICATION: Sub-agent "test-coverage" completed ---

Agent: I see two analyses are done. Let me get the results.

<tool_call>get_subagent_result({ id: "api-analysis" })</tool_call>

Tool result: {
  success: true,
  id: "api-analysis",
  mode: "background",
  output: { endpoints: 12, undocumented: 3 },
  tokensUsed: 8000
}

<tool_call>get_subagent_result({ id: "test-coverage" })</tool_call>

Tool result: {
  success: true,
  id: "test-coverage",
  mode: "background",
  output: { coverage: "72%", gaps: ["auth/*", "utils/*"] },
  tokensUsed: 15000
}

Agent: API has 12 endpoints (3 undocumented), test coverage is 72%.
I'll incorporate this into my work while deps-audit continues running.
```

**Mixed eager and background:**

```
Agent: I need API analysis immediately, but deps audit can run in background.

<tool_call>
spawn_subagents({
  agents: [
    { type: "research", task: "Analyze API endpoints", mode: "eager", tools: [...] },
    { id: "deps-audit", type: "research", task: "Audit dependencies", mode: "background", tools: [...] }
  ]
})
</tool_call>

Tool result: {
  success: true,
  results: [
    { id: "auto-1", mode: "eager", success: true, output: { endpoints: 12 }, tokensUsed: 8000 },
    { id: "deps-audit", mode: "background", status: "running" }
  ]
}

Agent: Got the API analysis (12 endpoints). Deps audit running in background.
```

### Programmatic Usage Examples

```typescript
// ============================================
// EXAMPLE 1: Single eager sub-agent
// ============================================
const [result] = await workflow.agent.spawnChildren([
  {
    type: "research",
    task: "Analyze the auth module for security issues",
    tools: [
      { name: "read", scope: { paths: ["src/auth/**"] } },
      { name: "grep", scope: { paths: ["src/auth/**"] } },
    ],
    limits: { maxTokens: 30_000, maxTurns: 5 },
  },
]);

console.log(result);
// {
//   id: "auto-1",
//   mode: "eager",
//   success: true,
//   output: { concerns: ["No rate limiting", "Weak hashing"], ... },
//   tokensUsed: 12500,
// }

// ============================================
// EXAMPLE 2: Multiple eager sub-agents (parallel)
// ============================================
const results = await workflow.agent.spawnChildren([
  {
    type: "research",
    task: "Analyze API surface",
    tools: [{ name: "read", scope: { paths: ["src/api/**"] } }],
  },
  {
    type: "research",
    task: "Analyze test coverage",
    tools: [
      { name: "read", scope: { paths: ["src/**", "tests/**"] } },
      { name: "script", scope: { scripts: ["test:coverage"] } },
    ],
  },
  {
    type: "research",
    task: "Check dependencies",
    tools: [{ name: "read", scope: { paths: ["package.json"] } }],
  },
]);

// All 3 run in parallel, function returns when all complete
console.log(results);
// [
//   { id: "auto-1", mode: "eager", success: true, output: { endpoints: 12 }, ... },
//   { id: "auto-2", mode: "eager", success: true, output: { coverage: "72%" }, ... },
//   { id: "auto-3", mode: "eager", success: true, output: { outdated: ["lodash"] }, ... },
// ]

// ============================================
// EXAMPLE 3: Single background sub-agent
// ============================================
const [result] = await workflow.agent.spawnChildren([
  {
    id: "deps-audit",
    type: "research",
    task: "Deep audit of all dependencies",
    mode: "background",
    tools: [
      { name: "read" },
      { name: "script", scope: { scripts: ["audit"] } },
    ],
    limits: { maxTokens: 50_000, timeout: 300_000 }, // 5 min timeout
  },
]);

console.log(result);
// {
//   id: "deps-audit",
//   mode: "background",
//   success: true,  // Just means it spawned successfully
//   output: null,   // No output yet — running in background
//   tokensUsed: 0,
// }

// ... later, after notification "subagent.completed: deps-audit" ...

const finalResult = workflow.agent.getChildResult("deps-audit");
console.log(finalResult);
// {
//   id: "deps-audit",
//   mode: "background",
//   success: true,
//   output: { vulnerabilities: [...], recommendations: [...] },
//   tokensUsed: 35000,
// }

// ============================================
// EXAMPLE 4: Mixed eager and background
// ============================================
const results = await workflow.agent.spawnChildren([
  // This one we need immediately
  {
    type: "research",
    task: "Quick API check",
    mode: "eager",
    tools: [{ name: "read", scope: { paths: ["src/api/**"] } }],
    limits: { maxTokens: 10_000, maxTurns: 3 },
  },
  // These can run in background
  {
    id: "full-audit",
    type: "research",
    task: "Full codebase audit",
    mode: "background",
    tools: [{ name: "read" }, { name: "grep" }],
  },
  {
    id: "docs-check",
    type: "research",
    task: "Documentation accuracy check",
    mode: "background",
    tools: [{ name: "read", scope: { paths: ["docs/**", "src/**"] } }],
  },
]);

console.log(results);
// [
//   { id: "auto-1", mode: "eager", success: true, output: { ... }, tokensUsed: 8000 },
//   { id: "full-audit", mode: "background", success: true, output: null, tokensUsed: 0 },
//   { id: "docs-check", mode: "background", success: true, output: null, tokensUsed: 0 },
// ]

// Function returns as soon as eager ones complete
// Background ones continue running, will notify when done

// ============================================
// EXAMPLE 5: Scoped refactoring sub-agent
// ============================================
const [result] = await workflow.agent.spawnChildren([
  {
    type: "refactor",
    task: "Extract validation logic into src/auth/validation/",
    tools: [
      { name: "read", scope: { paths: ["src/auth/**"] } },
      {
        name: "write",
        scope: { paths: ["src/auth/validation/**"], allowCreate: true },
      },
      { name: "grep", scope: { paths: ["src/**"] } },
    ],
    limits: { maxTokens: 50_000, maxTurns: 20 },
  },
]);

// Sub-agent can only write to src/auth/validation/**, nowhere else

// ============================================
// EXAMPLE 6: Read-only git analysis
// ============================================
const [result] = await workflow.agent.spawnChildren([
  {
    type: "research",
    task: "Analyze recent changes to auth module",
    tools: [
      { name: "read", scope: { paths: ["src/auth/**"] } },
      { name: "git", scope: { operations: ["log", "diff", "status"] } }, // No commit/push
    ],
  },
]);

// ============================================
// EXAMPLE 7: Sub-agent with limited scripts
// ============================================
const [result] = await workflow.agent.spawnChildren([
  {
    type: "testing",
    task: "Run auth tests and analyze failures",
    tools: [
      { name: "read", scope: { paths: ["src/auth/**", "tests/auth/**"] } },
      {
        name: "script",
        scope: { scripts: ["test:auth", "test:auth:coverage"] },
      }, // Only these scripts
    ],
  },
]);

// ============================================
// EXAMPLE 8: No scope restrictions (full access)
// ============================================
const [result] = await workflow.agent.spawnChildren([
  {
    type: "research",
    task: "General codebase exploration",
    tools: [
      { name: "read" }, // No scope = full read access
      { name: "grep" }, // No scope = can grep anywhere
      { name: "outline" },
    ],
  },
]);
```

### Agent Stack

When a sub-agent is spawned, the parent is paused and pushed to a stack:

```
┌─────────────────────────────────────────┐
│ Agent Stack                             │
├─────────────────────────────────────────┤
│ [2] research (active)     ← current     │
│ [1] refactor (waiting)                  │
│ [0] coding (waiting)      ← root        │
└─────────────────────────────────────────┘
```

When the sub-agent completes, it's popped and the parent resumes:

```typescript
// In WorkflowAgentController
async spawnChild(options: SubAgentOptions): Promise<SubAgentResult> {
  const parent = this.activeAgent;

  // Create scoped adapter
  const childAdapter = this.registry.createAdapter(options.type, {
    ...this.config,
    scope: options.scope,
    tools: this.filterTools(options.tools),
    limits: options.limits,
    parent: parent?.adapter,
  });

  // Push to stack
  this.agentStack.push(parent);
  this.activeAgent = { type: options.type, adapter: childAdapter };

  // Run sub-agent
  const result = await childAdapter.runToCompletion(options.task);

  // Pop stack, restore parent
  this.activeAgent = this.agentStack.pop();

  return result;
}
```

### Scope Inheritance

Sub-agents can spawn their own sub-agents, but scope can only be **narrowed**, never widened:

```typescript
// Parent has: { name: "read", scope: { paths: ["src/**"] } }
// Child requests: { name: "read", scope: { paths: ["src/**", "tests/**"] } }
// Result: { name: "read", scope: { paths: ["src/**"] } }
// ↑ "tests/**" denied because parent doesn't have it

// Parent has: { name: "git", scope: { operations: ["status", "diff", "log", "commit"] } }
// Child requests: { name: "git", scope: { operations: ["status", "diff", "commit", "push"] } }
// Result: { name: "git", scope: { operations: ["status", "diff", "commit"] } }
// ↑ "push" denied, "log" not requested so not included

function narrowToolScope(
  parentTool: ScopedTool,
  requestedTool: ScopedTool,
): ScopedTool {
  // Tool must define how to narrow its scope
  const toolDef = registry.getTool(requestedTool.name);
  return {
    name: requestedTool.name,
    scope: toolDef.narrowScope(parentTool.scope, requestedTool.scope),
  };
}

// Each tool implements its own narrowing logic
// Example for read tool:
readTool.narrowScope = (parent, requested) => ({
  paths: intersectGlobs(parent?.paths ?? ["**"], requested?.paths ?? ["**"]),
});

// Example for git tool:
gitTool.narrowScope = (parent, requested) => ({
  operations: intersection(
    parent?.operations ?? ALL_GIT_OPS,
    requested?.operations ?? ALL_GIT_OPS,
  ),
});
```

### Sub-Agent Tasks

- [ ] Add `agentStack` and `completedChildren` map to `WorkflowAgentController`
- [ ] Implement `spawnChildren()` — handles both eager and background modes
- [ ] Implement `getChildResult()` — retrieve completed background agent result
- [ ] Add `depth` and `parent` properties to controller
- [ ] Add `runToCompletion()` to AgentAdapter for sub-agent mode
- [ ] Add resource limit enforcement (tokens, turns, timeout)
- [ ] Emit `agent.notification` hook when background sub-agent completes
- [ ] Implement `spawn_subagents` tool in Pi adapter
- [ ] Implement `get_subagent_result` tool in Pi adapter
- [ ] Register sub-agent types (`research`, `refactor`, etc.) in Pi adapter

### Tool Scoping Tasks (Plugin Side)

- [ ] Add `scopeSchema` field to `OrchestratorTool` interface
- [ ] Add `narrowScope()` method to `OrchestratorTool` interface
- [ ] Update tool execution context to include `scope`
- [ ] Implement scope validation in Pi adapter's read tool
- [ ] Implement scope validation in Pi adapter's write tool
- [ ] Implement scope validation in Pi adapter's git tool
- [ ] Implement scope validation in Pi adapter's script tool
- [ ] Implement scope narrowing for each tool
- [ ] Unit tests for scoped tool execution
- [ ] Integration tests for nested sub-agents with scope inheritance

## Future Enhancements

- **Agent Specialization** — Route to specialized agents based on task type (debug, refactor, review)
- **Workflow Templates** — Predefined agent chains (review flow, refactor flow)
- **Cross-Issue Memory** — Share learnings across related issues
- **Agent Collaboration** — Agents discussing with each other via shared context or tools
- **Checkpoint/Resume** — Save full workflow state for later resumption
- **Agent Marketplace** — Discover and install community agent types
- **Conditional Workflows** — Branch workflows based on agent outputs
- **Sub-agent Caching** — Cache sub-agent results for repeated queries
- **Scope Presets** — Named scope configurations (e.g., "read-only", "single-file", "test-only")
