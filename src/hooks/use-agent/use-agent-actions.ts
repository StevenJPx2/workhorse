/**
 * Agent action functions for useAgent hook
 */

import type { AgentInstance } from "../../harness/orchestrator/types.ts";
import {
  spawnAgent as orchestratorSpawn,
  stopAgent as orchestratorStop,
} from "../../harness/orchestrator/orchestrator.ts";
import type { SpawnOptions } from "./types.ts";
import type { ResolvedOptions } from "./use-agent-helpers.ts";

export interface AgentActionsDeps {
  setError: (err: Error | null) => void;
  setIsLoading: (loading: boolean) => void;
  resolvers: ResolvedOptions;
  onStateChange: ((ticketId: string, state: import("../../harness/orchestrator/types.ts").AgentState) => void) | undefined;
  reload: () => void;
}

export function createAgentActions(deps: AgentActionsDeps) {
  const spawn = async (spawnOptions: SpawnOptions): Promise<AgentInstance | null> => {
    try {
      deps.setIsLoading(true);
      deps.setError(null);

      const repoPath = deps.resolvers.getRepoPath();

      const result = await orchestratorSpawn({
        ticketId: spawnOptions.ticketId,
        agentType: spawnOptions.agentType,
        repoPath,
        issueType: spawnOptions.issueType,
        baseBranch: spawnOptions.baseBranch,
        jiraCloudId: deps.resolvers.resolveJiraCloudId(),
        jiraSummary: spawnOptions.summary,
        jiraDescription: spawnOptions.description,
        jiraUrl: spawnOptions.jiraUrl,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to spawn agent");
      }

      deps.reload();
      deps.onStateChange?.(spawnOptions.ticketId, "running");

      return result.instance ?? null;
    } catch (err) {
      deps.resolvers.handleError(err);
      return null;
    } finally {
      deps.setIsLoading(false);
    }
  };

  const stop = async (
    ticketId: string,
    removeWorktree: boolean = false,
  ): Promise<boolean> => {
    try {
      deps.setIsLoading(true);
      deps.setError(null);

      const repoPath = deps.resolvers.getRepoPath();

      const result = await orchestratorStop(ticketId, repoPath, removeWorktree);

      if (!result.success) {
        throw new Error(result.error || "Failed to stop agent");
      }

      deps.reload();
      deps.onStateChange?.(ticketId, "stopped");

      return true;
    } catch (err) {
      deps.resolvers.handleError(err);
      return false;
    } finally {
      deps.setIsLoading(false);
    }
  };

  return { spawn, stop };
}