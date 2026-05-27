/** Agent adapter base class. Lifecycle: create() → start() → sendMessage() → stop() */
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Database, Issue } from "#db";
import type { HookEmitter } from "#lib";
import { createWorktree, removeWorktree } from "#lib";
import type { MemoryService } from "#services";
import { PromptEngineer, type SteeringRule } from "#workflow";

import type { HarnessOrchestrator } from "../orchestrator.ts";
import type { ModelRegistry } from "../registry.ts";
import type {
  AgentHarness,
  AgentState,
  CreateOptions,
  StopOptions,
} from "../types/adapter.ts";
import type { OrchestratorTool } from "../types/tools.ts";
import { subscribeAgentHooks } from "./hooks.ts";
import { createSteeringRules } from "./steering-setup.ts";

/** Base class for agent adapters. Subclasses override doStart/doStop/sendMessage/isRunning. */
export class AgentAdapter {
  readonly harness: AgentHarness = "base";
  static readonly displayName: string = "Base Agent";
  static readonly icon: string = "🤖";

  /** Model registry for this adapter. Subclasses set this to their specific implementation. */
  static registry: ModelRegistry;
  state: AgentState = "stopped";
  readonly issue: Issue;
  worktreePath: string = "";
  readonly repoPath: string;
  systemPrompt: string = "";
  initialMessage: string = "";
  readonly model?: string;
  protected readonly orchestrator: HarnessOrchestrator;
  protected engineer: PromptEngineer;
  protected steering: SteeringRule[];

  protected constructor(options: CreateOptions) {
    this.issue = options.issue;
    this.repoPath = options.repoPath;
    this.orchestrator = options.orchestrator;
    this.model = options.model;

    this.engineer = new PromptEngineer(
      this.issue,
      this.memory,
      this.orchestrator.config.prompt.custom,
      this.hooks,
    );

    this.steering = createSteeringRules(this.orchestrator, this.issue);
  }
  get tools(): OrchestratorTool[] {
    return this.orchestrator
      .getTools()
      .filter(
        (t) => !t.sources?.length || t.sources.includes(this.issue.source),
      )
      .filter((t) => !t.status?.length || t.status.includes(this.issue.status));
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
  get issueId(): string {
    return this.issue.externalId;
  }
  get skills() {
    return this.orchestrator.skillRegistry.getSkills();
  }

  /** Factory method - creates and initializes an adapter instance. */
  static async create(options: CreateOptions): Promise<AgentAdapter> {
    const adapter = new this(options) as AgentAdapter;

    adapter.hooks.emit("agent.create.pre", {
      issue: adapter.issue,
      options,
    });
    const worktree = await createWorktree(
      options.repoPath,
      adapter.issue.externalId,
      adapter.issue.issueType,
      options.baseBranch ?? "main",
    );
    if (!worktree)
      throw new Error(
        `Failed to create worktree for ${adapter.issue.externalId}`,
      );

    adapter.worktreePath = worktree.path;
    await adapter.db.issues.update(adapter.issue.id, {
      worktreePath: worktree.path,
    });

    // Register L1 context for session memory
    const l1Context = adapter.memory.l1.register(
      adapter.issue.externalId,
      worktree.path,
    );
    if (!l1Context.exists()) {
      await l1Context.create(
        `${adapter.issue.externalId}: ${adapter.issue.title}`,
        adapter.issue.status,
      );
    }

    const { systemPrompt, initialMessage } =
      await adapter.engineer.buildHybridPrompt({
        isResume: existsSync(
          join(adapter.worktreePath, ".workhorse", "session"),
        ),
        tools: adapter.tools,
        skills: adapter.skills,
      });
    adapter.systemPrompt = systemPrompt;
    adapter.initialMessage = initialMessage;

    subscribeAgentHooks(adapter.hooks, adapter);

    adapter.hooks.emit("agent.create.post", { adapter });

    return adapter;
  }

  /** Start the agent. Subclasses override doStart(). */
  async start(): Promise<void> {
    if (this.state === "running" || this.state === "starting") {
      throw new Error(`Agent for ${this.issueId} is already running`);
    }
    this.state = "starting";
    this.hooks.emit("agent.start.pre", { adapter: this });
    try {
      await this.doStart();
      this.state = "running";
      this.hooks.emit("agent.start.post", { adapter: this });
    } catch (error) {
      this.state = "crashed";
      throw error;
    }
  }

  /** Harness-specific start. Subclasses must override. */
  protected async doStart(): Promise<void> {
    throw new Error("Subclass must implement doStart()");
  }

  /** Send message to agent. Subclasses must override. */
  async sendMessage(_content: string): Promise<void> {
    if (this.state !== "running")
      throw new Error(
        `Agent for ${this.issueId} is not running (state: ${this.state})`,
      );
    throw new Error("Subclass must implement sendMessage()");
  }

  /** Stop the agent. Subclasses override doStop(). */
  async stop(options: StopOptions = {}): Promise<void> {
    if (this.state === "stopped" || this.state === "stopping") return;
    this.hooks.emit("agent.stop.pre", { adapter: this });
    this.state = "stopping";
    try {
      await this.doStop();
    } finally {
      this.state = "stopped";
      for (const rule of this.steering) rule.dispose();
      if (options.removeWorktree && this.worktreePath)
        await removeWorktree(this.repoPath, this.issueId, options.deleteBranch);
      // Use callHook to await async cleanup handlers (e.g., Playwright browser close)
      await this.hooks.callHook("agent.stop.post", { adapter: this });
    }
  }

  /** Harness-specific stop. Subclasses must override. */
  protected async doStop(): Promise<void> {
    throw new Error("Subclass must implement doStop()");
  }
  /** Check if agent is running. Subclasses must override. */
  isRunning(): boolean {
    throw new Error("Subclass must implement isRunning()");
  }
}
