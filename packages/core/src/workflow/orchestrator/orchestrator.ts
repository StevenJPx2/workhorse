/** HarnessOrchestrator - Registry/factory for agent adapters. @module workflow/orchestrator/orchestrator */
import type { WorkhorseConfig } from "#config";
import type { Database } from "#db";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";
import {
  type SteeringRuleConfig,
  type SteeringRuleConfigInput,
  SteeringRuleConfigSchema,
} from "#workflow";

import { AgentManager } from "./agent-manager.ts";
import { SkillRegistry } from "./skills";
import type {
  AdapterInfo,
  AgentAdapter,
  ModelInfo,
  OrchestratorTool,
  SpawnOptions,
} from "./types";

/** Main orchestrator class for managing agent lifecycles. */
export class HarnessOrchestrator {
  private readonly tools = new Map<string, OrchestratorTool>();
  private readonly adapters = new Map<string, typeof AgentAdapter>();
  private readonly steeringRules: SteeringRuleConfig[] = [];
  readonly skillRegistry: SkillRegistry;
  private readonly agentManager: AgentManager;

  constructor(
    readonly db: Database,
    readonly hooks: HookEmitter,
    readonly memory: MemoryService,
    readonly config: Readonly<WorkhorseConfig>,
  ) {
    this.skillRegistry = new SkillRegistry(hooks);
    this.agentManager = new AgentManager(this);
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

  /** Get all registered harness names. */
  getRegisteredHarnesses(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Get info about all registered adapters (for UI display). */
  getAdapterInfoList(): AdapterInfo[] {
    return Array.from(this.adapters.entries()).map(
      ([harness, AdapterClass]) => ({
        harness,
        displayName: AdapterClass.displayName ?? harness,
        icon: AdapterClass.icon ?? "🤖",
      }),
    );
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
    return (
      this.adapters.get(harness)?.registry.getPreferredProvider() ?? "unknown"
    );
  }

  /** Find a model in a specific adapter. */
  findModelInAdapter(
    harness: string,
    provider: string,
    modelId: string,
  ): ModelInfo | undefined {
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
    if (this.tools.has(tool.name))
      console.warn(`Tool "${tool.name}" already registered`);
    this.tools.set(tool.name, tool);
  }

  /** Get all registered tools. */
  getTools(): OrchestratorTool[] {
    return Array.from(this.tools.values());
  }

  /** Spawn a new agent for an issue. Creates worktree, builds prompt, returns adapter. */
  spawn(options: SpawnOptions): Promise<AgentAdapter> {
    return this.agentManager.spawn(options);
  }

  /** Send a message to a running agent. */
  sendMessage(issueId: string, content: string): Promise<void> {
    return this.agentManager.sendMessage(issueId, content);
  }

  /** Get an agent by issue ID. */
  getAgent(issueId: string): AgentAdapter | undefined {
    return this.agentManager.getAgent(issueId);
  }

  /** Get all active agents. */
  getAll(): AgentAdapter[] {
    return this.agentManager.getAll();
  }

  /** Remove an agent from tracking (call after adapter.stop()). */
  untrack(issueId: string): void {
    this.agentManager.untrack(issueId);
  }

  /** Register a steering rule config. Plugins call this during setup. */
  registerSteeringRule(config: SteeringRuleConfigInput): void {
    this.steeringRules.push(SteeringRuleConfigSchema.parse(config));
  }

  getSteeringRules(): SteeringRuleConfig[] {
    return this.steeringRules;
  }

  /** Shutdown all agents. */
  shutdown(): Promise<void> {
    return this.agentManager.shutdown();
  }
}
