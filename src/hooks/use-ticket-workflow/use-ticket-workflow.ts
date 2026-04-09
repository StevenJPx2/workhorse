import { createSignal } from "solid-js";
import { useAgent } from "../use-agent/index.ts";
import type {
  UseTicketWorkflowOptions,
  UseTicketWorkflowReturn,
} from "./types.ts";
import { createStartWork, createStopWork } from "./start-stop-work.ts";
import { createRestartAgent, createResumeAllAgents } from "./restart-agent.ts";

const DEFAULT_HEALTH_CHECK_INTERVAL = 5000;

export function useTicketWorkflow(
  options: UseTicketWorkflowOptions = {}
): UseTicketWorkflowReturn {
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const agent = useAgent({
    repoPath: options.repoPath,
    jiraCloudId: options.jiraCloudId,
    healthCheckInterval: options.healthCheckInterval ?? DEFAULT_HEALTH_CHECK_INTERVAL,
    autoLoad: true,
    onStateChange: options.onAgentStateChange,
    onError: options.onError,
  });

  const handleError = (err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    options.onError?.(e);
    return e;
  };

  const deps = { setIsLoading, setError, handleError, agent };

  const startWork = createStartWork(deps);
  const stopWork = createStopWork(deps);
  const restartAgent = createRestartAgent(deps);
  const resumeAllAgents = createResumeAllAgents(deps, restartAgent);

  const getAgentState = (ticketId: string) => agent.getState(ticketId);
  const isAgentRunning = (ticketId: string) => agent.isRunning(ticketId);
  const sendToAgent = async (ticketId: string, message: string) =>
    agent.sendMessage(ticketId, message);

  const getRunningAgents = () =>
    agent.getRunning().map((a) => ({ ticketId: a.ticketId, state: a.state }));

  const reloadAgents = () => agent.reload();

  const captureOutput = async (ticketId: string) => agent.captureOutput(ticketId);

  return {
    isLoading,
    error,
    startWork,
    stopWork,
    restartAgent,
    resumeAllAgents,
    getAgentState,
    isAgentRunning,
    sendToAgent,
    getRunningAgents,
    reloadAgents,
    captureOutput,
  };
}