/**
 * useAgent hook - Reactive agent lifecycle management
 *
 * Provides Solid.js reactive state management for AI coding agents.
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
import {
  createNotificationWatcherManager,
  NOTIFICATION_WATCH_INTERVAL,
} from "./use-notification-watchers.ts";

/**
 * Hook for managing AI agents with reactive state
 */
export function useAgent(options: UseAgentOptions = {}): UseAgentReturn {
  const [agents, setAgents] = createSignal<Map<string, AgentInstance>>(new Map());
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const resolvers = createResolvers(options, setError);
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Notification watcher manager
  const watcherManager = createNotificationWatcherManager(
    options.notificationWatchInterval ?? NOTIFICATION_WATCH_INTERVAL,
    { onNotificationsInjected: options.onNotificationsInjected },
  );

  const reload = (): void => {
    const allAgents = getAllAgents();
    const agentMap = new Map<string, AgentInstance>();
    for (const agent of allAgents) {
      agentMap.set(agent.ticketId, agent);
    }
    setAgents(agentMap);
  };

  const { spawn: spawnAction, stop: stopAction } = createAgentActions({
    setError,
    setIsLoading,
    resolvers,
    onStateChange: options.onStateChange,
    reload,
  });

  const spawn = async (spawnOptions: Parameters<typeof spawnAction>[0]) => {
    const result = await spawnAction(spawnOptions);
    if (result?.state === "running") watcherManager.start(spawnOptions.ticketId);
    return result;
  };

  const stop = async (ticketId: string, removeWorktree?: boolean) => {
    watcherManager.stop(ticketId);
    return stopAction(ticketId, removeWorktree);
  };

  const get = (ticketId: string): AgentInstance | undefined => agents().get(ticketId);
  const isRunning = (ticketId: string): boolean => get(ticketId)?.state === "running";
  const getState = (ticketId: string) => get(ticketId)?.state;

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
      if (prevState !== newState && newState) options.onStateChange?.(ticketId, newState);
      return result;
    } catch (err) {
      resolvers.handleError(err);
      return null;
    }
  };

  const getRunning = (): AgentInstance[] => getAgentsByState("running");

  const startHealthChecks = () => {
    if (options.healthCheckInterval && options.healthCheckInterval > 0) {
      healthCheckTimer = setInterval(async () => {
        for (const agent of getRunning()) await checkHealth(agent.ticketId);
      }, options.healthCheckInterval);
    }
  };

  onCleanup(() => {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
    watcherManager.stopAll();
  });

  if (options.autoLoad) {
    onMount(async () => {
      await discoverAgents();
      reload();
      startHealthChecks();
      for (const agent of getRunning()) watcherManager.start(agent.ticketId);
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
