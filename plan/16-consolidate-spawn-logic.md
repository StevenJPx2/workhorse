# Step 16: Consolidate Spawn Logic into AgentAdapter

Move spawn orchestration logic from `spawn.ts` into the `AgentAdapter` class and simplify the orchestrator to be just a registry/factory.

## Status

**State:** In progress

### Completed

- Created plan with full design

### Remaining

1. Refactor `PromptEngineer` to per-issue instantiation
2. Refactor `SteeringService` to per-issue instantiation
3. Rewrite `AgentAdapter` as concrete class with `create()` factory (owns engineer + steering)
4. Delete `types/adapter-context.ts`
5. Delete `types/adapter-class.ts` (inline `typeof AgentAdapter` where needed)
6. Move `StopOptions` to `types/agent.ts`, add `CreateOptions`
7. Delete `spawn.ts`
8. Simplify orchestrator to registry/factory role (remove engineer/steering)
9. Rename hooks in `lib/hooks/types.ts`
10. Update `types/index.ts` exports
11. Update tests

### Implementation Notes

**Circular import handling:**

- `AgentAdapter` needs `HarnessOrchestrator` type for `CreateOptions`
- `HarnessOrchestrator` uses `AgentAdapter` class
- Solution: Use `import type { HarnessOrchestrator }` in `agent.ts` to avoid runtime circular dependency
- Alternative: Define `CreateOptions` with orchestrator as `unknown` and cast internally (less type-safe)

**Orchestrator visibility changes:**

- `db`, `hooks`, `memory` → change from `private readonly` to `readonly` (public)
- Remove `engineer` from orchestrator (now per-adapter)
- Remove `steering` from orchestrator (now per-adapter)

**PromptEngineer and SteeringService → per-adapter:**

- Currently orchestrator owns one instance shared across all agents
- Problem: Functions take `issue` param and do issueId lookups everywhere
- Solution: Instantiate per-adapter with `issue` bound at construction
- Benefits:
  - No more `issueId` params on every method
  - No more Map lookups by issueId in SteeringService
  - Simpler APIs: `engineer.buildHybridPrompt()` instead of `engineer.buildHybridPrompt(issue, ...)`
  - SteeringService state (`firedOnce`, `recentHooks`, `cooldowns`) becomes simple instance fields
  - Adapter owns its own steering lifecycle (reset on create, cleanup on stop)

**AdapterClass type:**

- Delete `types/adapter-class.ts` entirely
- Use `typeof AgentAdapter` directly in orchestrator
- The type becomes: `new (options: CreateOptions) => AgentAdapter` implicitly via `typeof`

**Test updates needed:**

- `orchestrator.test.ts`: Update `stop()` tests (now on adapter, not orchestrator)
- Add new tests for `AgentAdapter.create()`, `start()`, `stop()` lifecycle
- Mock adapter class needs `create()` static method instead of constructor
- Update PromptEngineer tests for per-issue instantiation
- Update SteeringService tests for per-issue instantiation

## Problem

Currently, `spawn.ts` handles:

1. Worktree creation (`createWorktree`)
2. Resume detection (`existsSync(.jiratown/session)`)
3. Prompt building (`engineer.buildHybridPrompt`)
4. Tool collection (`getTools()`)
5. Adapter instantiation
6. Hook emissions (`orchestrator.spawn.pre`, `orchestrator.spawn.post`)

This means:

- Adapters receive a pre-built `AdapterContext` with `systemPrompt` and `initialMessage` already computed
- Custom adapters can't customize prompt building or worktree handling
- The orchestrator has intimate knowledge of adapter initialization details
- `SpawnContext` is awkwardly passed around instead of being orchestrator state
- Testing adapters requires mocking the entire spawn flow
- Lifecycle methods are split awkwardly between orchestrator and adapter

## Solution

1. **Delete `spawn.ts`** — All spawn logic moves to `AgentAdapter.create()`
2. **Concrete `AgentAdapter`** — Owns its context as instance properties AND owns its lifecycle (start/stop/sendMessage)
3. **Per-issue PromptEngineer** — Adapter owns its own engineer instance, no more issueId params
4. **Per-issue SteeringService** — Adapter owns its own steering instance, simple instance state instead of Maps
5. **Simplify orchestrator** — Becomes a registry/factory only, returns adapter for caller to control
6. **Adapter owns lifecycle** — `start()`, `stop()`, `sendMessage()` called directly on adapter

## Proposed Design

### PromptEngineer (Per-Issue)

```typescript
// tracker/engineer.ts
export class PromptEngineer {
  constructor(
    private readonly issue: Issue,
    private readonly memory: MemoryService,
    private readonly customInstructions?: string,
  ) {}

  /** Build hybrid prompt - no issue param needed */
  async buildHybridPrompt(
    options: HybridPromptOptions = {},
  ): Promise<HybridPrompt> {
    const { sessionMemory, searchResults, contextBlocks, isResume } =
      await this.gatherContext(options);
    return {
      systemPrompt: this.buildSystemPrompt(
        contextBlocks,
        searchResults,
        options.tools ?? [],
      ),
      initialMessage: isResume
        ? buildResumePrompt(this.issue, sessionMemory)
        : buildInitialPrompt(this.issue),
    };
  }

  private async gatherContext(options: BuildPromptOptions) {
    // Uses this.issue directly - no issueId lookups
    let sessionMemory: SessionMemory | undefined;
    let isResume = options.isResume ?? false;

    if (this.issue.worktreePath) {
      const l1Context = this.memory.l1.get(this.issue.externalId);
      if (l1Context?.exists()) {
        sessionMemory = (await l1Context.read()) ?? undefined;
        isResume = options.isResume ?? true;
      }
    }

    const notifications = this.memory.notifications.getUnread(this.issue.id);
    // ... rest simplified
  }
}
```

### SteeringService (Per-Issue State, Global Rules)

The steering rules are universal - they don't change per issue. But the **state** (which rules have fired, cooldowns, recent hooks) is per-issue.

Architecture:

- **Orchestrator** owns the global rule registry
- **SteeringService** (per-issue) references the orchestrator's rules but owns its own state

```typescript
// steering/service.ts
export class SteeringService {
  // Per-issue state - no Maps keyed by issueId
  private firedOnce = new Set<string>();
  private recentHooks: RecentHookEvent[] = [];
  private lastReminderTime = 0;

  constructor(
    private readonly issue: Issue,
    private readonly db: Database,
    private readonly memory: MemoryService,
    private readonly hooks: HookEmitter,
    private readonly config: SteeringConfig,
    private readonly getRules: () => Map<string, SteeringRule>, // Reference to orchestrator's rules
  ) {
    this.hooks.on("agent.idle", this.handleIdle.bind(this));
  }

  private handleIdle({
    issueId,
    status,
    source,
  }: HookEventMap["agent.idle"]): void {
    // Only handle if it's for our issue
    if (issueId !== this.issue.externalId) return;
    if (!this.config.enabled) return;
    // ... simplified - no Map lookups
  }

  private async processIdle(): Promise<void> {
    // Cooldown check - simple number comparison
    if (Date.now() - this.lastReminderTime < this.config.cooldownMs) return;

    const { matching, firedRules } = await evaluateRules(
      this.getRules(), // Get rules from orchestrator
      buildContext(this.issue, this.db, this.memory, this.recentHooks),
      this.firedOnce,
    );

    if (matching.length > 0) {
      for (const ruleId of firedRules) {
        this.firedOnce.add(ruleId);
      }
      this.lastReminderTime = Date.now();
      this.hooks.emit("steering.reminder", {
        issueId: this.issue.externalId,
        reminder: formatReminders(
          matching.slice(0, this.config.maxReminders).map((m) => m.reminder),
        ),
      });
    }
  }

  /** Cleanup when adapter stops */
  dispose(): void {
    // Unsubscribe from hooks
  }
}
```

### AgentAdapter (Concrete Base Class)

```typescript
// types/agent.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Database, Issue } from "#db";
import { createWorktree, removeWorktree } from "#lib/git";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import type { PromptEngineer } from "#workflow/tracker";
import type { OrchestratorTool } from "./tools.ts";

export type AgentHarness = string;
export type AgentState =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed";

// CreateOptions = SpawnOptions + orchestrator (no separate interface needed)
// Adapter.create() receives SpawnOptions & { orchestrator }
export interface CreateOptions extends SpawnOptions {
  orchestrator: HarnessOrchestrator;
}

export interface StopOptions {
  /** Remove the git worktree after stopping (default: false) */
  removeWorktree?: boolean;
  /** Also delete the branch when removing worktree (default: false) */
  deleteBranch?: boolean;
}

/**
 * Base class for agent adapters.
 *
 * Concrete class that handles common initialization (worktree, prompt building)
 * and owns the full agent lifecycle.
 *
 * Subclasses extend this to implement harness-specific behavior.
 *
 * Lifecycle: create() → start() → sendMessage() → stop()
 */
export class AgentAdapter {
  /** Harness identifier (override in subclass) */
  readonly harness: AgentHarness = "base";

  /** Current lifecycle state */
  state: AgentState = "stopped";

  /** Issue this agent is working on */
  readonly issue: Issue;

  /** Path to the git worktree */
  worktreePath: string = "";

  /** Path to the main repository */
  readonly repoPath: string;

  /** System prompt for the agent */
  systemPrompt: string = "";

  /** Initial message to send */
  initialMessage: string = "";

  /** Orchestrator reference (for tools, hooks, memory, db, etc.) */
  readonly orchestrator: HarnessOrchestrator;

  /** Model override */
  readonly model?: string;

  /** Per-issue prompt engineer  */
  protected engineer: PromptEngineer;

  /** Per-issue steering service */
  protected steering: SteeringService;

  protected constructor(options: CreateOptions) {
    this.issue = options.issue;
    this.repoPath = options.repoPath;
    this.orchestrator = options.orchestrator;
    this.model = options.model;

    // Create per-issue services
    this.engineer = new PromptEngineer(
      this.issue,
      this.memory,
      this.orchestrator.config.prompt.custom,
    );
    this.steering = new SteeringService(
      this.issue,
      this.db,
      this.memory,
      this.hooks,
      this.orchestrator.config.steering,
      () => this.orchestrator.getSteeringRules(), // Reference to global rules
    );
  }

  // Convenience accessors via orchestrator
  get tools(): OrchestratorTool[] {
    return this.orchestrator.getTools();
  }
  get db(): Database {
    return this.orchestrator.db;
  }
  get hooks(): HookEmitter {
    return this.orchestrator.hooks;
  }
  get memory(): MemoryService {
    return this.orchestrator.memory;
  }

  /** Issue external ID (convenience getter) */
  get issueId(): string {
    return this.issue.externalId;
  }

  /**
   * Factory method to create an adapter.
   * Handles worktree creation, resume detection, and prompt building.
   * Does NOT call start() — caller is responsible for that.
   *
   * Subclasses can override to customize initialization.
   */
  static async create(options: CreateOptions): Promise<AgentAdapter> {
    const adapter = new AgentAdapter(options);
    await adapter.initialize(options);
    return adapter;
  }

  /**
   * Initialize the adapter environment.
   * Called by create(). Subclasses can override to customize.
   */
  protected async initialize(options: CreateOptions): Promise<void> {
    this.hooks.emit("agent.create.pre", { issue: this.issue, options });

    // Create or reuse worktree
    const worktree = await createWorktree(
      options.repoPath,
      this.issue.externalId,
      this.issue.issueType,
      options.baseBranch ?? "main",
    );
    if (!worktree) {
      throw new Error(`Failed to create worktree for ${this.issue.externalId}`);
    }
    this.worktreePath = worktree.path;

    // Update DB with worktree path
    this.db.issues.update(this.issue.id, { worktreePath: worktree.path });

    // Detect resume and build prompt (engineer is per-issue, no issue param needed)
    const isResume = existsSync(join(worktree.path, ".jiratown", "session"));
    const { systemPrompt, initialMessage } =
      await this.engineer.buildHybridPrompt({
        isResume,
        tools: this.tools,
      });
    this.systemPrompt = systemPrompt;
    this.initialMessage = initialMessage;

    this.hooks.emit("agent.create.post", { adapter: this });
  }

  /**
   * Start the agent session.
   * Base implementation emits hooks; subclasses override for harness-specific startup.
   */
  async start(): Promise<void> {
    if (this.state === "running" || this.state === "starting") {
      throw new Error(`Agent for ${this.issueId} is already running`);
    }

    this.hooks.emit("agent.start.pre", { adapter: this });
    this.state = "starting";

    try {
      await this.doStart();
      this.state = "running";
      this.hooks.emit("agent.start.post", { adapter: this });
    } catch (error) {
      this.state = "crashed";
      throw error;
    }
  }

  /**
   * Harness-specific start logic.
   * Subclasses must override this (not start()).
   */
  protected async doStart(): Promise<void> {
    throw new Error("Subclass must implement doStart()");
  }

  /**
   * Send a message to the agent.
   * Subclasses must override to implement harness-specific messaging.
   */
  async sendMessage(_content: string): Promise<void> {
    if (this.state !== "running") {
      throw new Error(
        `Agent for ${this.issueId} is not running (state: ${this.state})`,
      );
    }
    throw new Error("Subclass must implement sendMessage()");
  }

  /**
   * Stop the agent session.
   * Base implementation emits hooks and handles worktree cleanup.
   */
  async stop(options: StopOptions = {}): Promise<void> {
    if (this.state === "stopped" || this.state === "stopping") {
      return;
    }

    this.hooks.emit("agent.stop.pre", { adapter: this });
    this.state = "stopping";

    try {
      await this.doStop();
    } finally {
      this.state = "stopped";

      // Dispose per-issue services
      this.steering.dispose();

      if (options.removeWorktree && this.worktreePath) {
        await removeWorktree(this.repoPath, this.issueId, options.deleteBranch);
      }

      this.hooks.emit("agent.stop.post", { adapter: this });
    }
  }

  /**
   * Harness-specific stop logic.
   * Subclasses must override this (not stop()).
   */
  protected async doStop(): Promise<void> {
    throw new Error("Subclass must implement doStop()");
  }

  /**
   * Check if the agent is currently running/streaming.
   * Subclasses must override.
   */
  isRunning(): boolean {
    throw new Error("Subclass must implement isRunning()");
  }
}
```

### Simplified HarnessOrchestrator

The orchestrator becomes a simple registry/factory. It no longer owns lifecycle methods or per-issue services — those belong to the adapter.

```typescript
// orchestrator.ts
import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { Database } from "#db/database";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import type { SteeringRule } from "#workflow/steering";
import type { AgentAdapter, OrchestratorTool, SpawnOptions } from "./types";

/**
 * Registry and factory for agent adapters.
 *
 * The orchestrator:
 * - Registers adapter classes, tools, and steering rules (plugins call these)
 * - Creates adapter instances via spawn()
 * - Tracks active agents for lookup
 * - Handles notification delivery to running agents
 *
 * Lifecycle control (start/stop/sendMessage) is owned by the adapter itself.
 * PromptEngineer is per-adapter (created during adapter.initialize()).
 * SteeringService is per-adapter but references the orchestrator's global rule registry.
 */
export class HarnessOrchestrator {
  private readonly agents = new Map<string, AgentAdapter>();
  private readonly tools = new Map<string, OrchestratorTool>();
  private readonly adapters = new Map<string, typeof AgentAdapter>();
  private readonly steeringRules = new Map<string, SteeringRule>();

  constructor(
    readonly db: Database,
    readonly hooks: Emitter<HookEventMap>,
    readonly memory: MemoryService,
    readonly config: Readonly<JiratownConfig>,
  ) {
    // Push notifications to running agents
    this.hooks.on("notification.created", async ({ notification, issueId }) => {
      const agent = this.agents.get(issueId);
      if (agent?.state === "running") {
        try {
          await agent.sendMessage(
            this.memory.notifications.generateInbox([notification]),
          );
        } catch (err) {
          console.error(
            `Failed to push notification to agent ${issueId}:`,
            err,
          );
        }
      }
    });

    // Steering reminders are now emitted by per-adapter SteeringService
    // and delivered directly via the adapter's hooks subscription
  }

  /** Register an adapter class. Plugins call this during setup. */
  registerAdapter(harness: string, adapterClass: typeof AgentAdapter): void {
    if (this.adapters.has(harness)) {
      console.warn(
        `Adapter for harness "${harness}" already registered, overwriting`,
      );
    }
    this.adapters.set(harness, adapterClass);
  }

  /** Get an adapter class by harness name. */
  getAdapterClass(harness: string): typeof AgentAdapter | undefined {
    return this.adapters.get(harness);
  }

  /** Register a tool. Plugins call this during setup. */
  registerTool(tool: OrchestratorTool): void {
    if (this.tools.has(tool.name))
      console.warn(`Tool "${tool.name}" already registered`);
    this.tools.set(tool.name, tool);
  }

  /** Get all registered tools. */
  getTools(): OrchestratorTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Spawn a new agent for an issue.
   * Creates worktree, builds prompt, returns adapter.
   * Does NOT start the agent — call adapter.start() for that.
   */
  async spawn(options: SpawnOptions): Promise<AgentAdapter> {
    const harness = options.harness ?? this.config.agent.harness;
    const { issue } = options;
    const issueId = issue.externalId;

    // Check if agent already exists
    const existing = this.agents.get(issueId);
    if (existing) {
      if (existing.state === "running" || existing.state === "starting") {
        throw new Error(`Agent for issue ${issueId} is already running`);
      }
      this.agents.delete(issueId);
    }

    // Look up adapter class
    const AdapterClass = this.getAdapterClass(harness);
    if (!AdapterClass) {
      throw new Error(`No adapter registered for harness: ${harness}`);
    }

    // Create adapter (handles worktree + prompt)
    const adapter = await AdapterClass.create({
      issue,
      repoPath: options.repoPath,
      baseBranch: options.baseBranch ?? "main",
      model: options.model,
      orchestrator: this,
    });

    this.agents.set(issueId, adapter);
    return adapter;
  }

  /** Get an agent by issue ID. */
  getAgent(issueId: string): AgentAdapter | undefined {
    return this.agents.get(issueId);
  }

  /** Get all active agents. */
  getAll(): AgentAdapter[] {
    return Array.from(this.agents.values());
  }

  /** Remove an agent from tracking (called after stop). */
  untrack(issueId: string): void {
    this.agents.delete(issueId);
  }

  /** Register a steering rule. Plugins call this during setup. Rules are global. */
  registerSteeringRule(rule: SteeringRule): void {
    this.steeringRules.set(rule.id, rule);
  }

  /** Unregister a steering rule. */
  unregisterSteeringRule(id: string): void {
    this.steeringRules.delete(id);
  }

  /** Get all steering rules (called by per-adapter SteeringService). */
  getSteeringRules(): Map<string, SteeringRule> {
    return this.steeringRules;
  }

  /** Shutdown all agents. */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.agents.values()).map((agent) =>
        agent
          .stop()
          .catch((err) =>
            console.error(`Error stopping agent ${agent.issueId}:`, err),
          ),
      ),
    );
    this.agents.clear();
  }
}
```

### Hook Event Changes

```typescript
// lib/hooks/types.ts
// Before:
"orchestrator.spawn.pre":  { issue: Issue; options: SpawnOptions }
"orchestrator.spawn.post": { adapter: AgentAdapter }
"orchestrator.stop.pre":   { adapter: AgentAdapter }
"orchestrator.stop.post":  { adapter: AgentAdapter }

// After:
"agent.create.pre":  { issue: Issue; options: CreateOptions }
"agent.create.post": { adapter: AgentAdapter }
"agent.start.pre":   { adapter: AgentAdapter }
"agent.start.post":  { adapter: AgentAdapter }
"agent.stop.pre":    { adapter: AgentAdapter }
"agent.stop.post":   { adapter: AgentAdapter }
```

### Example: Subclass Implementation

```typescript
// packages/plugins/pi-adapter/src/adapter.ts
import {
  AgentAdapter,
  type CreateOptions,
  type StopOptions,
} from "@jiratown/core";
import {
  type AgentSession,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";

export class PiAgentAdapter extends AgentAdapter {
  readonly harness = "pi-coding-agent";
  private session: AgentSession | null = null;

  // Optional: override initialize() to customize worktree/prompt
  protected async initialize(options: CreateOptions): Promise<void> {
    await super.initialize(options);
    // Pi-specific initialization after base setup
  }

  protected async doStart(): Promise<void> {
    const extensionFactory = this.createExtensionFromTools();
    const loader = new DefaultResourceLoader({
      cwd: this.worktreePath,
      systemPromptOverride: () => this.systemPrompt,
      extensionFactories: [extensionFactory],
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd: this.worktreePath,
      resourceLoader: loader,
    });
    this.session = session;
    this.subscribeToEvents();

    await session.prompt(this.initialMessage);
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.session) throw new Error("Session not started");
    if (this.session.isStreaming) {
      await this.session.steer(content);
    } else {
      await this.session.prompt(content);
    }
  }

  protected async doStop(): Promise<void> {
    this.session?.dispose();
    this.session = null;
  }

  isRunning(): boolean {
    return this.session?.isStreaming ?? false;
  }

  private createExtensionFromTools() {
    /* ... */
  }
  private subscribeToEvents() {
    /* ... */
  }
}
```

## File Changes

| File                       | Change                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `types/agent.ts`           | Rewrite as concrete class with full lifecycle ownership                                     |
| `types/adapter-context.ts` | **Delete** — context now owned by AgentAdapter                                              |
| `types/adapter-class.ts`   | **Delete** — inline `typeof AgentAdapter` in orchestrator                                   |
| `types/spawn.ts`           | Keep `SpawnOptions`, move `StopOptions` to `types/agent.ts`, add `CreateOptions` type alias |
| `types/index.ts`           | Update exports, add `CreateOptions`, `StopOptions`                                          |
| `spawn.ts`                 | **Delete** — logic moved to AgentAdapter.create()                                           |
| `orchestrator.ts`          | Simplify to registry/factory, keep steering rule registry                                   |
| `lib/hooks/types.ts`       | Rename hooks, use `SpawnOptions` for agent.create.pre                                       |
| `tracker/engineer.ts`      | Refactor to per-issue: bind issue at construction                                           |
| `steering/service.ts`      | Refactor to per-issue state, reference global rules via getter                              |

## Migration Steps

1. **Refactor `tracker/engineer.ts`** — per-issue instantiation:
   - Constructor takes `issue`, `memory`, `config` (not just memory/config)
   - Remove `issue` param from all methods
   - `buildPrompt()` and `buildHybridPrompt()` become simpler
   - `gatherContext()` uses `this.issue` directly

2. **Refactor `steering/service.ts`** — per-issue state, global rules:
   - Constructor takes `issue`, `db`, `memory`, `hooks`, `config`, `getRules` (getter for global rules)
   - Remove all Map lookups by issueId
   - `firedOnce`, `recentHooks`, `cooldowns` become simple instance fields (Set/array/number)
   - Remove `resetForIssue()` — just create new instance
   - `handleIdle()` no longer needs issueId param
   - Reference `this.getRules()` to get rules from orchestrator

3. **Rewrite `types/agent.ts`** — concrete class with:
   - `CreateOptions` and `StopOptions` interfaces
   - Instance properties: `issue`, `repoPath`, `orchestrator`, `worktreePath`, `systemPrompt`, `initialMessage`, `state`
   - **New**: `engineer` and `steering` as instance properties (per-adapter)
   - `create()` static factory method
   - `initialize()` protected method (worktree + prompt building + engineer/steering instantiation)
   - `start()`/`stop()`/`sendMessage()` lifecycle with hooks
   - `doStart()`/`doStop()` protected template methods for subclasses
   - Convenience getters: `tools`, `db`, `hooks`, `memory`, `issueId`
   - Import `HarnessOrchestrator` as type-only to avoid circular runtime dependency

4. **Delete `types/adapter-context.ts`** — absorbed into `AgentAdapter`

5. **Delete `types/adapter-class.ts`** — use `typeof AgentAdapter` directly

6. **Update `types/spawn.ts`**:
   - Keep `SpawnOptions` (used by orchestrator and hooks)
   - Move `StopOptions` to `types/agent.ts`
   - Add `CreateOptions` type alias: `SpawnOptions & { orchestrator }`

7. **Delete `spawn.ts`** — logic moved to `AgentAdapter.create()`

8. **Simplify `orchestrator.ts`**:
   - Make `db`, `hooks`, `memory`, `config` public (readonly)
   - **Remove** `engineer` instance (now per-adapter)
   - **Keep** steering rule registry (rules are global, state is per-adapter)
   - Add `getSteeringRules()` method for adapters to reference
   - Remove `stop()` and `sendMessage()` methods (adapter owns these)
   - Add `untrack()` method
   - Update `spawn()` to call `AdapterClass.create()` instead of constructor
   - Use `typeof AgentAdapter` for adapter map type

9. **Update `lib/hooks/types.ts`**:
   - Use `SpawnOptions` for `agent.create.pre` (not CreateOptions - orchestrator not available yet)
   - Replace `orchestrator.spawn.pre/post` → `agent.create.pre/post`
   - Replace `orchestrator.stop.pre/post` → `agent.stop.pre/post`
   - Add `agent.start.pre/post`

10. **Update `types/index.ts`** — export `CreateOptions`, `StopOptions`

11. **Update tests** — adapt to new lifecycle ownership and per-issue services

**Note**: Plugin steering rule registration (`ctx.orchestrator.registerSteeringRule()`) remains unchanged — rules are global. Only the per-issue state (firedOnce, cooldowns) is tracked per-adapter.

## Tests

- `AgentAdapter.create()`: creates worktree and builds prompt
- `AgentAdapter.create()`: emits `agent.create.pre` and `agent.create.post`
- `AgentAdapter.create()`: does NOT call start()
- `AgentAdapter.create()`: subclass can override initialize()
- `adapter.start()`: changes state and emits hooks
- `adapter.start()`: throws if already running
- `adapter.stop()`: changes state, emits hooks, handles worktree cleanup
- `adapter.sendMessage()`: throws if not running
- `orchestrator.spawn()`: creates and tracks adapter
- `orchestrator.spawn()`: throws if agent already running
- `orchestrator.shutdown()`: stops all agents

## Application Usage Example

The orchestrator returns an adapter, and the application controls the adapter directly:

```typescript
import { bootstrap } from "@jiratown/core";
import { PiAgentAdapter } from "@jiratown/plugin-pi-adapter";

async function main() {
  // 1. Bootstrap the Jiratown instance
  const jt = await bootstrap("/path/to/repo");

  // 2. Register the adapter (typically done by a plugin during setup)
  jt.orchestrator.registerAdapter("pi-coding-agent", PiAgentAdapter);

  // 3. Register custom tools (optional, plugins usually do this)
  jt.orchestrator.registerTool({
    name: "my_custom_tool",
    description: "Does something useful",
    schema: { type: "object", properties: { arg: { type: "string" } } },
    execute: async (args, ctx) => {
      return { success: true, data: `Processed: ${args.arg}` };
    },
  });

  // 4. Parse an issue from external source (e.g., Jira webhook)
  const issue = jt.tracker.parse({
    externalId: "PROJ-123",
    summary: "Implement feature X",
    description: "Build the feature as specified...",
    issueType: "Story",
    status: "in_progress",
  });

  // 5. Spawn an agent (creates worktree, builds prompt)
  const agent = await jt.orchestrator.spawn({
    issue,
    repoPath: "/path/to/repo",
    baseBranch: "main",
  });

  console.log(`Agent created for ${agent.issueId}`);
  console.log(`Worktree: ${agent.worktreePath}`);
  console.log(`State: ${agent.state}`); // "stopped"

  // 6. Start the agent (adapter owns this)
  await agent.start();
  console.log(`State: ${agent.state}`); // "running"

  // 7. Send messages directly to the agent
  await agent.sendMessage("User commented: Please also add tests");

  // 8. Listen to agent events via hooks
  jt.hooks.on("agent.output", ({ issueId, delta }) => {
    process.stdout.write(delta);
  });

  jt.hooks.on("agent.idle", ({ issueId, status }) => {
    console.log(`Agent ${issueId} went idle with status: ${status}`);
  });

  // 9. Stop agent when done (adapter owns this)
  await agent.stop({
    removeWorktree: false,
    deleteBranch: false,
  });

  // 10. Optionally untrack from orchestrator
  jt.orchestrator.untrack(agent.issueId);

  // 11. Graceful shutdown (stops all tracked agents)
  await jt.shutdown();
}
```

### Spawn and Start Pattern

```typescript
// Common pattern: spawn and immediately start
const agent = await jt.orchestrator.spawn({ issue, repoPath });
await agent.start();

// Or as a helper
async function spawnAndStart(
  orchestrator: HarnessOrchestrator,
  options: SpawnOptions,
): Promise<AgentAdapter> {
  const agent = await orchestrator.spawn(options);
  await agent.start();
  return agent;
}
```

### Hook-Based Workflows

Plugins can hook into the agent lifecycle:

```typescript
export const myPlugin = definePlugin({
  name: "my-plugin",
  setup(ctx) {
    // React to agent creation (after worktree + prompt ready)
    ctx.hooks.on("agent.create.post", ({ adapter }) => {
      console.log(`Agent created: ${adapter.issueId}`);
      // Could modify adapter.systemPrompt here before start()
    });

    // React to agent start
    ctx.hooks.on("agent.start.post", ({ adapter }) => {
      console.log(`Agent started: ${adapter.issueId}`);
    });

    // React to agent stop
    ctx.hooks.on("agent.stop.post", ({ adapter }) => {
      console.log(`Agent stopped: ${adapter.issueId}`);
    });
  },
});
```
