/**
 * HarnessOrchestrator - Manages agent instances across multiple issues.
 * @module workflow/orchestrator/orchestrator
 *
 * The orchestrator is a registry/factory for agent adapters:
 * - Registers adapter classes, tools, and steering rules (plugins call these)
 * - Creates adapter instances via spawn()
 * - Tracks active agents for lookup
 * - Handles notification and steering reminder delivery to running agents
 *
 * Steering rules are global (registered here), but state (firedOnce, cooldowns)
 * is per-adapter via SteeringRule instances created by each adapter.
 *
 * Lifecycle control (start/stop/sendMessage) is owned by the adapter itself.
 * The orchestrator just spawns and tracks agents.
 */

import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { Database } from "#db/database";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import {
  type SteeringRuleConfig,
  type SteeringRuleConfigInput,
  SteeringRuleConfigSchema,
} from "#workflow/steering";
import type { AgentAdapter, OrchestratorTool, SpawnOptions } from "./types";

/**
 * Main orchestrator class for managing agent lifecycles.
 */
export class HarnessOrchestrator {
  private readonly agents = new Map<string, AgentAdapter>();
  private readonly tools = new Map<string, OrchestratorTool>();
  private readonly adapters = new Map<string, typeof AgentAdapter>();
  private readonly steeringRules: SteeringRuleConfig[] = [];

  constructor(
    readonly db: Database,
    readonly hooks: Emitter<HookEventMap>,
    readonly memory: MemoryService,
    readonly config: Readonly<JiratownConfig>,
  ) {}

  /** Register an adapter class. Plugins call this during setup. */
  registerAdapter(harness: string, adapterClass: typeof AgentAdapter): void {
    if (this.adapters.has(harness)) {
      console.warn(`Adapter for harness "${harness}" already registered, overwriting`);
    }
    this.adapters.set(harness, adapterClass);
  }

  /** Get an adapter class by harness name. */
  getAdapterClass(harness: string): typeof AgentAdapter | undefined {
    return this.adapters.get(harness);
  }

  /** Register a tool. Plugins call this during setup. */
  registerTool(tool: OrchestratorTool): void {
    if (this.tools.has(tool.name)) console.warn(`Tool "${tool.name}" already registered`);
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

    // Create adapter (handles worktree + prompt via AgentAdapter.create())
    const adapter = await AdapterClass.create({
      ...options,
      orchestrator: this,
    });

    this.agents.set(issueId, adapter);

    return adapter;
  }

  /** Send a message to a running agent. */
  async sendMessage(issueId: string, content: string): Promise<void> {
    const adapter = this.agents.get(issueId);
    if (!adapter) throw new Error(`No agent found for issue ${issueId}`);
    if (adapter.state !== "running") {
      throw new Error(`Agent for ${issueId} is not running (state: ${adapter.state})`);
    }
    await adapter.sendMessage(content);
  }

  /** Get an agent by issue ID. */
  getAgent(issueId: string): AgentAdapter | undefined {
    return this.agents.get(issueId);
  }

  /** Get all active agents. */
  getAll(): AgentAdapter[] {
    return Array.from(this.agents.values());
  }

  /** Remove an agent from tracking (call after adapter.stop()). */
  untrack(issueId: string): void {
    this.agents.delete(issueId);
  }

  /** Register a steering rule config. Plugins call this during setup. */
  registerSteeringRule(config: SteeringRuleConfigInput): void {
    this.steeringRules.push(SteeringRuleConfigSchema.parse(config));
  }

  getSteeringRules(): SteeringRuleConfig[] {
    return this.steeringRules;
  }

  /** Shutdown all agents. */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.agents.values()).map((agent) =>
        agent.stop().catch((err) => console.error(`Error stopping agent ${agent.issueId}:`, err)),
      ),
    );
    this.agents.clear();
  }
}
