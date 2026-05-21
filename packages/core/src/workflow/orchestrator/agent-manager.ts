/** Agent lifecycle management for HarnessOrchestrator. */
import type { HarnessOrchestrator } from "./orchestrator.ts";
import type { AgentAdapter, SpawnOptions } from "./types";

export class AgentManager {
  private readonly agents = new Map<string, AgentAdapter>();

  constructor(private readonly orchestrator: HarnessOrchestrator) {}

  /** Spawn a new agent for an issue. Creates worktree, builds prompt, returns adapter. */
  async spawn(options: SpawnOptions): Promise<AgentAdapter> {
    const harness = options.harness ?? this.orchestrator.config.agent.harness;
    const { issue } = options;
    const issueId = issue.externalId;

    const existing = this.agents.get(issueId);
    if (existing) {
      if (existing.state === "running" || existing.state === "starting") {
        throw new Error(`Agent for issue ${issueId} is already running`);
      }
      this.agents.delete(issueId);
    }

    const AdapterClass = this.orchestrator.getAdapterClass(harness);
    if (!AdapterClass) {
      throw new Error(`No adapter registered for harness: ${harness}`);
    }

    const adapter = await AdapterClass.create({
      ...options,
      orchestrator: this.orchestrator,
    });
    this.agents.set(issueId, adapter);

    return adapter;
  }

  /** Send a message to a running agent. */
  async sendMessage(issueId: string, content: string): Promise<void> {
    const adapter = this.agents.get(issueId);
    if (!adapter) throw new Error(`No agent found for issue ${issueId}`);
    if (adapter.state !== "running") {
      throw new Error(
        `Agent for ${issueId} is not running (state: ${adapter.state})`,
      );
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
