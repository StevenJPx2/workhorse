/** Agent adapter base class. Lifecycle: create() → start() → sendMessage() → stop() */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "#db";
import type { Database } from "#db/database";
import { createWorktree, removeWorktree } from "#lib/git";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { SteeringRule } from "#workflow/steering";
import { PromptEngineer } from "#workflow/tracker";
import type { HarnessOrchestrator } from "./orchestrator.ts";
import type { ModelRegistry } from "./registry.ts";
import type {
  AdapterInfo,
  AgentHarness,
  AgentState,
  CreateOptions,
  ModelInfo,
  StopOptions,
} from "./types/adapter.ts";
import type { OrchestratorTool } from "./types/tools.ts";

export type { AdapterInfo, AgentHarness, AgentState, CreateOptions, ModelInfo, StopOptions };

/** Base class for agent adapters. Subclasses override doStart/doStop/sendMessage/isRunning. */
export abstract class AgentAdapter {
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

    this.steering = this.orchestrator.getSteeringRules().map((config) => {
      return new SteeringRule({
        config,
        hooks: this.hooks,
        issue: this.issue,
        steeringConfig: this.orchestrator.config.steering,
        // Notifications are stored with internal issue.id (UUID)
        getNotifications: () => this.memory.notifications.getUnread(this.issue.id),
      });
    });
  }
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
  get issueId(): string {
    return this.issue.externalId;
  }

  /** Factory method - creates and initializes an adapter instance. */
  static async create(options: CreateOptions): Promise<AgentAdapter> {
    // Cast to any to allow instantiation of abstract class via concrete subclass
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const adapter = new (this as any)(options) as AgentAdapter;
    await adapter.initialize(options);
    return adapter;
  }

  /** Initialize worktree and build prompt. Called by create() after construction. */
  protected async initialize(options: CreateOptions): Promise<void> {
    this.hooks.emit("agent.create.pre", { issue: this.issue, options });

    // Create or reuse worktree (createWorktree handles existing worktrees)
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
    await this.db.issues.update(this.issue.id, { worktreePath: worktree.path });

    const { systemPrompt, initialMessage } = await this.engineer.buildHybridPrompt({
      isResume: existsSync(join(this.worktreePath, ".workhorse", "session")),
      tools: this.tools,
    });

    this.systemPrompt = systemPrompt;
    this.initialMessage = initialMessage;

    // Push notifications to agent
    // Note: issueId in hook payload is external ID (consistent with TUI activity store keying)
    this.hooks.on("notification.created", async ({ notification, issueId }) => {
      if (this.issueId !== issueId || this.state !== "running") return;
      await this.sendMessage(this.memory.notifications.generateInbox([notification])).catch((err) =>
        console.error(`Failed to push notification to agent ${this.issueId}:`, err),
      );
    });

    // Deliver steering reminders to agent
    this.hooks.on("steering.reminder", async ({ issueId, reminder }) => {
      if (this.issueId !== issueId || this.state !== "running") return;
      await this.sendMessage(reminder).catch((err) => {
        console.error(`Failed to deliver steering reminder to agent ${issueId}:`, err);
      });
    });

    this.hooks.emit("agent.create.post", { adapter: this });
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
      throw new Error(`Agent for ${this.issueId} is not running (state: ${this.state})`);
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
