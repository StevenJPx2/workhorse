/**
 * useTicketWorkflow - Thin reactive wrapper around core workflow functions
 *
 * This hook provides Solid.js reactive state (loading, errors) around
 * the core workflow operations. The core handles all business logic.
 */

import { createSignal } from "solid-js";
import { useAgent } from "../use-agent/index.ts";
import type { Ticket } from "#types/ticket.ts";
import type {
  UseTicketWorkflowOptions,
  UseTicketWorkflowReturn,
  StartWorkOptions,
} from "./types.ts";
import {
  launchTicketAgent,
  haltTicketAgent,
  restartTicketAgent,
  resumeAllTicketAgents,
} from "#core/workflow/index.ts";
import {
  getTicketById,
  getAllTickets,
  updateTicketStatus,
  updateTicket,
  insertTicketEvent,
} from "#core/db/index.ts";

const DEFAULT_HEALTH_CHECK_INTERVAL = 5000;

/** Resolve a value that may be a getter function */
function resolveValue<T>(value: T | (() => T | undefined) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T | undefined)() : value;
}

/** Database operations for core workflow */
const dbOps = {
  getTicketById,
  getAllTickets,
  updateTicketStatus,
  updateTicket,
  insertTicketEvent,
};

export function useTicketWorkflow(options: UseTicketWorkflowOptions = {}): UseTicketWorkflowReturn {
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  // Resolve option values that may be getters
  const getRepoPath = () => resolveValue(options.repoPath) ?? "";
  const getJiraCloudId = () => resolveValue(options.jiraCloudId);

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

  /** Generic wrapper for async operations with loading state */
  async function withLoading<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      setIsLoading(true);
      setError(null);
      return await fn();
    } catch (err) {
      handleError(err);
      return fallback;
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Workflow Operations ─────────────────────────────────────────────

  const startWork = async (opts: StartWorkOptions): Promise<Ticket | null> => {
    return withLoading(async () => {
      const result = await launchTicketAgent(
        {
          ticketId: opts.ticketId,
          agentType: opts.agent,
          issueType: opts.jiraIssue.issueType,
          summary: opts.jiraIssue.summary,
          description: opts.jiraIssue.description ?? undefined,
          jiraUrl: opts.jiraIssue.url,
          jiraCloudId: getJiraCloudId(),
          repoPath: getRepoPath(),
        },
        dbOps,
      );

      if (!result.success) {
        handleError(new Error(result.error ?? "Failed to start work"));
        return result.ticket;
      }

      // TUI event logging
      if (result.instance?.worktree) {
        options.eventLog?.logStatusChange({ from: "pending", to: "planning" });
        options.eventLog?.logAgentStarted({
          agent: opts.agent,
          worktreePath: result.instance.worktree.path,
        });
      }

      return result.ticket;
    }, null);
  };

  const stopWork = async (ticketId: string, removeWorktree: boolean = false): Promise<boolean> => {
    return withLoading(async () => {
      const ticket = dbOps.getTicketById(ticketId);
      const previousStatus = ticket?.status ?? "implementing";

      const result = await haltTicketAgent(ticketId, getRepoPath(), dbOps, { removeWorktree });

      if (!result.success) {
        handleError(new Error(result.error ?? "Failed to stop work"));
        return false;
      }

      // TUI event logging
      options.eventLog?.logStatusChange({ from: previousStatus, to: "pending" });
      options.eventLog?.logAgentStopped({ reason: removeWorktree ? "removed" : "stopped" });

      return true;
    }, false);
  };

  const restartAgent = async (ticketId: string): Promise<boolean> => {
    return withLoading(async () => {
      const result = await restartTicketAgent(ticketId, getRepoPath(), dbOps, getJiraCloudId());

      if (!result.success) {
        handleError(new Error(result.error ?? "Failed to restart agent"));
        return false;
      }

      return true;
    }, false);
  };

  const resumeAllAgents = async (): Promise<number> => {
    return withLoading(async () => {
      return await resumeAllTicketAgents(getRepoPath(), dbOps, getJiraCloudId());
    }, 0);
  };

  // ─── Agent State Queries (delegated to useAgent) ─────────────────────

  const getAgentState = (ticketId: string) => agent.getState(ticketId);
  const isAgentRunning = (ticketId: string) => agent.isRunning(ticketId);
  const sendToAgent = (ticketId: string, message: string) => agent.sendMessage(ticketId, message);
  const getRunningAgents = () =>
    agent.getRunning().map((a) => ({ ticketId: a.ticketId, state: a.state }));
  const reloadAgents = () => agent.reload();
  const captureOutput = (ticketId: string) => agent.captureOutput(ticketId);

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
