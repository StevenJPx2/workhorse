/** HarnessOrchestrator - Registry/factory for agent adapters. @module workflow/orchestrator/orchestrator */

import type { WorkhorseConfig } from "#config";
import type { Database } from "#db/database";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import {
  type SteeringRuleConfig,
  type SteeringRuleConfigInput,
  SteeringRuleConfigSchema,
} from "#workflow/steering";
import type { AdapterInfo, AgentAdapter, ModelInfo, OrchestratorTool, SpawnOptions } from "./types";

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
    readonly hooks: HookEmitter,
    readonly memory: MemoryService,
    readonly config: Readonly<WorkhorseConfig>,
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

  /** Get all registered harness names. */
  getRegisteredHarnesses(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Get info about all registered adapters (for UI display). */
  getAdapterInfoList(): AdapterInfo[] {
    return Array.from(this.adapters.entries()).map(([harness, AdapterClass]) => ({
      harness,
      displayName: AdapterClass.displayName ?? harness,
      icon: AdapterClass.icon ?? "🤖",
    }));
  }

  /** Get all models from a specific adapter. */
  getModelsForAdapter(harness: string): ModelInfo[] {
    return this.adapters.get(harness)?.registry.getAll() ?? [];
  }

  /** Get available (authenticated) models from a specific adapter. */
  getAvailableModelsForAdapter(harness: string): ModelInfo[] {
    return this.adapters.get(harness)?.registry.getAvailable() ?? [];
  }

  /** Get all models from all registered adapters, tagged with their harness. */
  getAllModels(): (ModelInfo & { harness: string })[] {
    const result: (ModelInfo & { harness: string })[] = [];
    for (const [harness, AdapterClass] of this.adapters.entries()) {
      for (const model of AdapterClass.registry.getAll()) {
        result.push({ ...model, harness });
      }
    }
    return result;
  }

  /** Get the preferred provider from a specific adapter. */
  getPreferredProviderForAdapter(harness: string): string {
    return this.adapters.get(harness)?.registry.getPreferredProvider() ?? "unknown";
  }

  /** Find a model in a specific adapter. */
  findModelInAdapter(harness: string, provider: string, modelId: string): ModelInfo | undefined {
    return this.adapters.get(harness)?.registry.find(provider, modelId);
  }

  /** Refresh models for all adapters. */
  refreshAllModels(): void {
    for (const adapter of this.adapters.values()) {
      adapter.registry.refresh();
    }
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

    // Create adapter via factory (handles construction + initialization)
    const adapter = await AdapterClass.create({ ...options, orchestrator: this });
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
