/**
 * HarnessOrchestrator - Manages agent instances across multiple issues.
 * @module workflow/orchestrator/orchestrator
 */

import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { Database } from "#db/database";
import { removeWorktree } from "#lib/git";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { SteeringService, type SteeringRule } from "#workflow/steering";
import { PromptEngineer } from "#workflow/tracker";
import { spawnAgent } from "./spawn.ts";
import type {
  AdapterClass,
  AgentAdapter,
  OrchestratorTool,
  SpawnOptions,
  StopOptions,
} from "./types";

/**
 * Main orchestrator class for managing agent lifecycles.
 */
export class HarnessOrchestrator {
  private readonly agents = new Map<string, AgentAdapter>();
  private readonly tools = new Map<string, OrchestratorTool>();
  private readonly adapters = new Map<string, AdapterClass>();
  private readonly engineer: PromptEngineer;
  private readonly steering: SteeringService;

  constructor(
    private readonly db: Database,
    private readonly hooks: Emitter<HookEventMap>,
    private readonly memory: MemoryService,
    private readonly config: Readonly<JiratownConfig>,
  ) {
    this.engineer = new PromptEngineer(memory, config);

    this.steering = new SteeringService(db, memory, hooks, this.config.steering);

    this.hooks.on("notification.created", async ({ notification, issueId }) => {
      const agent = this.agents.get(issueId);
      if (agent?.state === "running") {
        try {
          await agent.sendMessage(this.memory.notifications.generateInbox([notification]));
        } catch (err) {
          console.error(`Failed to push notification to agent ${issueId}:`, err);
        }
      }
    });

    // Deliver steering reminders to running agents
    this.hooks.on("steering.reminder", async ({ issueId, reminder }) => {
      const agent = this.agents.get(issueId);
      if (agent?.state === "running") {
        try {
          await agent.sendMessage(reminder);
        } catch (err) {
          console.error(`Failed to deliver steering reminder to agent ${issueId}:`, err);
        }
      }
    });
  }

  /** Register an adapter class. Plugins call this during setup. */
  registerAdapter(harness: string, adapterClass: AdapterClass): void {
    if (this.adapters.has(harness)) {
      console.warn(`Adapter for harness "${harness}" already registered, overwriting`);
    }
    this.adapters.set(harness, adapterClass);
  }

  /** Get an adapter class by harness name. */
  getAdapterClass(harness: string): AdapterClass | undefined {
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

  /** Spawn a new agent for an issue. */
  async spawn(options: SpawnOptions): Promise<AgentAdapter> {
    return spawnAgent(
      options,
      {
        db: this.db,
        hooks: this.hooks,
        memory: this.memory,
        config: this.config,
        agents: this.agents,
        getTools: () => this.getTools(),
        getAdapterClass: (harness: string) => this.getAdapterClass(harness),
      },
      this.engineer,
    );
  }

  /** Stop an agent for an issue. */
  async stop(issueId: string, options: StopOptions = {}): Promise<void> {
    const adapter = this.agents.get(issueId);
    if (!adapter) return;

    this.hooks.emit("orchestrator.stop.pre", { adapter });
    try {
      await adapter.stop();
    } finally {
      this.agents.delete(issueId);
      if (options.removeWorktree && adapter.worktreePath) {
        const repoPath = adapter.worktreePath.match(/^(.+)-worktrees[/\\][^/\\]+$/)?.[1];
        if (repoPath) await removeWorktree(repoPath, issueId, options.deleteBranch);
      }
      this.hooks.emit("orchestrator.stop.post", { adapter });
    }
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

  /** Register a steering rule. Plugins call this during setup. */
  registerSteeringRule(rule: SteeringRule): void {
    this.steering.registerRule(rule);
  }

  /** Unregister a steering rule. */
  unregisterSteeringRule(id: string): void {
    this.steering.unregisterRule(id);
  }

  /** Shutdown all agents. */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.agents.keys()).map((id) =>
        this.stop(id).catch((err) => console.error(`Error stopping agent ${id}:`, err)),
      ),
    );
  }
}
