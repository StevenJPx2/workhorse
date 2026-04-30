/**
 * Agent adapter base class.
 * Lifecycle: create() → start() → sendMessage() → stop()
 * @module workflow/orchestrator/types/agent
 */

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
import type { AgentHarness, AgentState, CreateOptions, StopOptions } from "./types/adapter.ts";
import type { OrchestratorTool } from "./types/tools.ts";

export type { AgentHarness, AgentState, CreateOptions, StopOptions };

/**
 * Base class for agent adapters. Subclasses override doStart(), doStop(),
 * sendMessage(), and isRunning() for harness-specific behavior.
 */
export class AgentAdapter {
  readonly harness: AgentHarness = "base";
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
    );

    this.steering = this.orchestrator.getSteeringRules().map((rule) => {
      return new SteeringRule(rule, this.hooks, this.issue, this.orchestrator.config.steering);
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

  /** Factory method. Does NOT call start(). */
  static async create(options: CreateOptions): Promise<AgentAdapter> {
    const adapter = new AgentAdapter(options);
    await adapter.initialize(options);
    return adapter;
  }

  /** Initialize worktree and build prompt. Subclasses can override. */
  protected async initialize(options: CreateOptions): Promise<void> {
    this.hooks.emit("agent.create.pre", { issue: this.issue, options });

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
    this.db.issues.update(this.issue.id, { worktreePath: worktree.path });

    const { systemPrompt, initialMessage } = await this.engineer.buildHybridPrompt({
      isResume: existsSync(join(worktree.path, ".jiratown", "session")),
      tools: this.tools,
    });

    this.systemPrompt = systemPrompt;
    this.initialMessage = initialMessage;

    this.hooks.emit("agent.create.post", { adapter: this });
  }

  /** Start the agent. Subclasses override doStart(). */
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

  /** Harness-specific start. Subclasses must override. */
  protected async doStart(): Promise<void> {
    throw new Error("Subclass must implement doStart()");
  }

  /** Send message to agent. Subclasses must override. */
  async sendMessage(_content: string): Promise<void> {
    if (this.state !== "running") {
      throw new Error(`Agent for ${this.issueId} is not running (state: ${this.state})`);
    }
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

      if (options.removeWorktree && this.worktreePath) {
        await removeWorktree(this.repoPath, this.issueId, options.deleteBranch);
      }

      this.hooks.emit("agent.stop.post", { adapter: this });
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
