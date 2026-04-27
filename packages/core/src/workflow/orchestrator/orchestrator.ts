/**
 * HarnessOrchestrator - Manages agent instances across multiple issues.
 * @module workflow/orchestrator/orchestrator
 */

import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { Database } from "../../db/database.ts";
import { removeWorktree } from "../../lib/git/worktree/index.ts";
import type { HookEventMap } from "../../lib/hooks/types.ts";
import type { MemoryService } from "../../services/memory/service.ts";
import { PromptEngineer } from "../tracker/engineer.ts";
import { spawnAgent } from "./spawn.ts";
import type { AgentAdapter, OrchestratorTool, SpawnOptions, StopOptions } from "./types/index.ts";

/**
 * Main orchestrator class for managing agent lifecycles.
 */
export class HarnessOrchestrator {
  private readonly agents = new Map<string, AgentAdapter>();
  private readonly tools = new Map<string, OrchestratorTool>();
  private readonly engineer: PromptEngineer;

  constructor(
    private readonly db: Database,
    private readonly hooks: Emitter<HookEventMap>,
    private readonly memory: MemoryService,
    private readonly config: Readonly<JiratownConfig>,
  ) {
    this.engineer = new PromptEngineer(memory, config);

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

  /** Shutdown all agents. */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.agents.keys()).map((id) =>
        this.stop(id).catch((err) => console.error(`Error stopping agent ${id}:`, err)),
      ),
    );
  }
}
