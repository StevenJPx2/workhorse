/**
 * useTicketWorkflow hook - High-level ticket workflow management
 *
 * Orchestrates agent spawning and worktree management for a ticket.
 * Note: Ticket creation should be done by the caller before calling startWork.
 */

import { createSignal } from "solid-js";
import type { Ticket } from "../../types/ticket.ts";
import {
  getTicketById,
  updateTicketStatus,
  updateTicket,
} from "../../lib/db/index.ts";
import { useAgent } from "../use-agent/index.ts";
import type {
  UseTicketWorkflowOptions,
  UseTicketWorkflowReturn,
  StartWorkOptions,
} from "./types.ts";

/**
 * Hook for managing the complete ticket workflow
 *
 * @example
 * ```tsx
 * function TicketManager() {
 *   const tickets = useTickets({ rig });
 *   const workflow = useTicketWorkflow({
 *     repoPath: '/path/to/repo',
 *     jiraCloudId: 'company.atlassian.net',
 *   });
 *
 *   const handleStart = async (jiraIssue) => {
 *     // Create ticket first
 *     const ticket = tickets.create({
 *       jiraKey: 'AM-123',
 *       rig: 'github.com/user/repo',
 *       summary: jiraIssue.summary,
 *       agent: 'opencode',
 *     });
 *
 *     // Then start workflow
 *     await workflow.startWork({
 *       ticketId: ticket.id,
 *       agent: 'opencode',
 *       jiraIssue,
 *     });
 *   };
 *
 *   return <button onPress={() => handleStart(issue)}>Start</button>;
 * }
 * ```
 */
export function useTicketWorkflow(
  options: UseTicketWorkflowOptions = {}
): UseTicketWorkflowReturn {
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  // Pass options as-is - useAgent now handles getter functions
  const agent = useAgent({
    repoPath: options.repoPath,
    jiraCloudId: options.jiraCloudId,
    onStateChange: options.onAgentStateChange,
    onError: options.onError,
  });

  const handleError = (err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(String(err));
    setError(e);
    options.onError?.(e);
    return e;
  };

  /**
   * Start work on a ticket
   *
   * Expects the ticket to already exist in the database.
   * Spawns an agent with a worktree and updates the ticket.
   */
  const startWork = async (opts: StartWorkOptions): Promise<Ticket | null> => {
    try {
      setIsLoading(true);
      setError(null);

      // Get existing ticket
      const ticket = getTicketById(opts.ticketId);
      if (!ticket) {
        handleError(new Error(`Ticket not found: ${opts.ticketId}`));
        return null;
      }

      // Update status to queued
      updateTicketStatus(ticket.id, "queued");

      // Spawn agent (this creates worktree and starts agent)
      const instance = await agent.spawn({
        ticketId: ticket.id,
        agentType: opts.agent,
        issueType: opts.jiraIssue.issueType,
        summary: opts.jiraIssue.summary,
        description: opts.jiraIssue.description ?? undefined,
      });

      if (!instance) {
        // Agent spawn failed, update ticket status
        updateTicketStatus(ticket.id, "pending");
        handleError(new Error("Failed to spawn agent"));
        return getTicketById(ticket.id);
      }

      // Update ticket with worktree info
      if (instance.worktree) {
        updateTicket(ticket.id, {
          worktree_path: instance.worktree.path,
          branch_name: instance.worktree.branch,
          status: "planning",
        });
      }

      return getTicketById(ticket.id);
    } catch (err) {
      handleError(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Stop work on a ticket
   */
  const stopWork = async (
    ticketId: string,
    removeWorktree: boolean = false
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      // Stop agent
      const stopped = await agent.stop(ticketId, removeWorktree);

      if (stopped) {
        // Update ticket status
        updateTicketStatus(ticketId, "pending");
        updateTicket(ticketId, {
          agent_pid: null,
        });
      }

      return stopped;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const getAgentState = (ticketId: string) => {
    return agent.getState(ticketId);
  };

  const isAgentRunning = (ticketId: string) => {
    return agent.isRunning(ticketId);
  };

  const sendToAgent = async (ticketId: string, message: string) => {
    return agent.sendMessage(ticketId, message);
  };

  return {
    isLoading,
    error,
    startWork,
    stopWork,
    getAgentState,
    isAgentRunning,
    sendToAgent,
  };
}
