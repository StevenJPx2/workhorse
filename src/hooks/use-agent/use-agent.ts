/**
 * useAgent hook - Reactive agent lifecycle management
 *
 * Provides Solid.js reactive state management for AI coding agents.
 * Wraps the orchestrator module for spawning/stopping agents.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import type { AgentInstance, HealthCheckResult } from "../../harness/orchestrator/types.ts";
import {
  spawnAgent as orchestratorSpawn,
  stopAgent as orchestratorStop,
  checkAgentHealth,
  getAgent,
  getAllAgents,
  getAgentsByState,
  sendMessageToAgent,
  captureAgentOutput,
} from "../../harness/orchestrator/orchestrator.ts";
import type { UseAgentOptions, UseAgentReturn, SpawnOptions } from "./types.ts";

/**
 * Hook for managing AI agents with reactive state
 *
 * @example
 * ```tsx
 * function AgentManager() {
 *   const agent = useAgent({
 *     repoPath: '/path/to/repo',
 *     jiraCloudId: 'company.atlassian.net',
 *   });
 *
 *   const handleSpawn = async () => {
 *     const instance = await agent.spawn({
 *       ticketId: 'AM-123',
 *       agentType: 'opencode',
 *       issueType: 'Bug',
 *       summary: 'Fix login bug',
 *     });
 *     console.log('Agent started:', instance?.state);
 *   };
 *
 *   return (
 *     <box>
 *       <text>Running: {agent.getRunning().length}</text>
 *       <button onPress={handleSpawn}>Start Agent</button>
 *     </box>
 *   );
 * }
 * ```
 */
export function useAgent(options: UseAgentOptions = {}): UseAgentReturn {
  const [agents, setAgents] = createSignal<Map<string, AgentInstance>>(new Map());
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Resolve option values (support both static values and getter functions)
  const resolveRepoPath = (): string | undefined => {
    const rp = options.repoPath;
    return typeof rp === "function" ? rp() : rp;
  };

  const resolveJiraCloudId = (): string | undefined => {
    const cid = options.jiraCloudId;
    return typeof cid === "function" ? cid() : cid;
  };

  const getRepoPath = (): string => {
    const repoPath = resolveRepoPath();
    if (!repoPath) {
      throw new Error("repoPath is required for agent operations");
    }
    return repoPath;
  };

  const handleError = (err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    options.onError?.(e);
    return e;
  };

  const reload = (): void => {
    const allAgents = getAllAgents();
    const agentMap = new Map<string, AgentInstance>();
    for (const agent of allAgents) {
      agentMap.set(agent.ticketId, agent);
    }
    setAgents(agentMap);
  };

  const spawn = async (spawnOptions: SpawnOptions): Promise<AgentInstance | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const repoPath = getRepoPath();

      const result = await orchestratorSpawn({
        ticketId: spawnOptions.ticketId,
        agentType: spawnOptions.agentType,
        repoPath,
        issueType: spawnOptions.issueType,
        baseBranch: spawnOptions.baseBranch,
        jiraCloudId: resolveJiraCloudId(),
        jiraSummary: spawnOptions.summary,
        jiraDescription: spawnOptions.description,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to spawn agent");
      }

      reload();
      options.onStateChange?.(spawnOptions.ticketId, "running");

      return result.instance ?? null;
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const stop = async (
    ticketId: string,
    removeWorktree: boolean = false
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      const repoPath = getRepoPath();

      const result = await orchestratorStop(ticketId, repoPath, removeWorktree);

      if (!result.success) {
        throw new Error(result.error || "Failed to stop agent");
      }

      reload();
      options.onStateChange?.(ticketId, "stopped");

      return true;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const get = (ticketId: string): AgentInstance | undefined => {
    return agents().get(ticketId);
  };

  const isRunning = (ticketId: string): boolean => {
    const agent = get(ticketId);
    return agent?.state === "running";
  };

  const getState = (ticketId: string) => {
    return get(ticketId)?.state;
  };

  const sendMessage = async (ticketId: string, message: string): Promise<boolean> => {
    try {
      setError(null);
      return await sendMessageToAgent(ticketId, message);
    } catch (err) {
      handleError(err);
      return false;
    }
  };

  const captureOutput = async (ticketId: string): Promise<string | null> => {
    try {
      setError(null);
      return await captureAgentOutput(ticketId);
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const checkHealth = async (ticketId: string): Promise<HealthCheckResult | null> => {
    try {
      setError(null);
      const result = await checkAgentHealth(ticketId);

      // Update state if health check detected a crash
      if (!result.healthy && get(ticketId)?.state === "running") {
        reload();
        options.onStateChange?.(ticketId, "crashed");
      }

      return result;
    } catch (err) {
      handleError(err);
      return null;
    }
  };

  const getRunning = (): AgentInstance[] => {
    return getAgentsByState("running");
  };

  // Start health check polling if enabled
  const startHealthChecks = () => {
    if (options.healthCheckInterval && options.healthCheckInterval > 0) {
      healthCheckTimer = setInterval(async () => {
        const running = getRunning();
        for (const agent of running) {
          await checkHealth(agent.ticketId);
        }
      }, options.healthCheckInterval);
    }
  };

  // Cleanup on unmount
  onCleanup(() => {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  });

  // Auto-load if requested
  if (options.autoLoad) {
    onMount(() => {
      reload();
      startHealthChecks();
    });
  }

  return {
    agents,
    isLoading,
    error,
    spawn,
    stop,
    get,
    isRunning,
    getState,
    sendMessage,
    captureOutput,
    checkHealth,
    getRunning,
    reload,
  };
}
