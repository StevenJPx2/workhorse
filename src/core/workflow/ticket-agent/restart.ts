/**
 * Restart an agent for an existing ticket
 */

import type { LaunchResult, DatabaseOperations } from "../types.ts";
import { spawnAgent, stopAgent } from "../../agent/orchestrator/index.ts";
import { trace } from "./trace.ts";
import { isAgentRunning } from "./is-agent-running.ts";

export async function restartTicketAgent(
  ticketId: string,
  repoPath: string,
  db: DatabaseOperations,
  jiraCloudId?: string,
): Promise<LaunchResult> {
  trace(ticketId, "RESTART_START");

  try {
    const ticket = db.getTicketById(ticketId);
    if (!ticket) {
      return {
        success: false,
        ticket: null,
        error: `Ticket not found: ${ticketId}`,
      };
    }

    // Stop if running
    if (isAgentRunning(ticketId)) {
      trace(ticketId, "STOPPING_EXISTING");
      await stopAgent(ticketId, repoPath, false);
    }

    // Re-spawn with existing ticket data using orchestrator
    const result = await spawnAgent({
      ticketId,
      agentType: ticket.agent,
      repoPath,
      issueType: "Task", // Default, could be stored on ticket
      jiraCloudId,
      jiraSummary: ticket.summary ?? undefined,
      jiraUrl: ticket.jira_url ?? undefined,
      status: ticket.status,
      prUrl: ticket.pr_url ?? undefined,
    });

    if (!result.success) {
      trace(ticketId, "RESTART_SPAWN_FAILED", { error: result.error });
      return {
        success: false,
        ticket: db.getTicketById(ticketId),
        error: result.error ?? "Failed to restart agent",
      };
    }

    // Update ticket with worktree info
    if (result.instance?.worktree) {
      db.updateTicket(ticketId, {
        worktree_path: result.instance.worktree.path,
        branch_name: result.instance.worktree.branch,
        status: "planning",
      });
    }

    trace(ticketId, "RESTART_SUCCESS");

    return {
      success: true,
      ticket: db.getTicketById(ticketId),
      instance: result.instance,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    trace(ticketId, "RESTART_ERROR", { error: errorMsg });

    return {
      success: false,
      ticket: null,
      error: errorMsg,
    };
  }
}
