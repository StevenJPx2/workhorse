/**
 * useAgent hook - Reactive agent lifecycle management
 *
 * Provides Solid.js reactive state management for AI coding agents.
 * Wraps the orchestrator module for spawning/stopping agents.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import type { AgentInstance, HealthCheckResult } from "#core/agent/orchestrator/types.ts";
import {
  checkAgentHealth,
  getAllAgents,
  getAgentsByState,
  sendMessageToAgent,
  captureAgentOutput,
  discoverAgents,
} from "#core/agent/orchestrator/orchestrator.ts";
import type { UseAgentOptions, UseAgentReturn } from "./types.ts";
import { createResolvers } from "./use-agent-helpers.ts";
import { createAgentActions } from "./use-agent-actions.ts";

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

  const resolvers = createResolvers(options, setError);

  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  const reload = (): void => {
    const allAgents = getAllAgents();
    const agentMap = new Map<string, AgentInstance>();
    for (const agent of allAgents) {
      agentMap.set(agent.ticketId, agent);
    }
    setAgents(agentMap);
  };

  const { spawn, stop } = createAgentActions({
    setError,
    setIsLoading,
    resolvers,
    onStateChange: options.onStateChange,
    reload,
  });

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
      resolvers.handleError(err);
      return false;
    }
  };

  const captureOutput = async (ticketId: string): Promise<string | null> => {
    try {
      setError(null);
      return await captureAgentOutput(ticketId);
    } catch (err) {
      resolvers.handleError(err);
      return null;
    }
  };

  const checkHealth = async (ticketId: string): Promise<HealthCheckResult | null> => {
    try {
      setError(null);
      const result = await checkAgentHealth(ticketId);

      const prevState = get(ticketId)?.state;

      reload();

      const newState = get(ticketId)?.state;
      if (prevState !== newState && newState) {
        options.onStateChange?.(ticketId, newState);
      }

      return result;
    } catch (err) {
      resolvers.handleError(err);
      return null;
    }
  };

  const getRunning = (): AgentInstance[] => {
    return getAgentsByState("running");
  };

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

  onCleanup(() => {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  });

  if (options.autoLoad) {
    onMount(async () => {
      // Discover existing tmux sessions first
      await discoverAgents();
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
