/**
 * Launch an agent to work on a ticket
 */

import type { LaunchTicketAgentOptions, LaunchResult, DatabaseOperations } from "../types.ts";
import { spawnAgent } from "../../agent/orchestrator/index.ts";
import { trace } from "./trace.ts";
import { fetchPRContext, parsePRUrl, formatPRContextSummary } from "../../github/index.ts";

export async function launchTicketAgent(
  options: LaunchTicketAgentOptions,
  db: DatabaseOperations,
): Promise<LaunchResult> {
  const {
    ticketId,
    agentType,
    issueType,
    summary,
    description,
    jiraUrl,
    jiraCloudId,
    repoPath,
    baseBranch,
  } = options;

  trace(ticketId, "LAUNCH_START", { agentType, issueType });

  try {
    // 1. Get and validate ticket
    const ticket = db.getTicketById(ticketId);
    if (!ticket) {
      return {
        success: false,
        ticket: null,
        error: `Ticket not found: ${ticketId}`,
      };
    }

    const previousStatus = ticket.status;

    // 2. Update status to queued
    db.updateTicketStatus(ticketId, "queued");
    db.insertTicketEvent({
      ticket_id: ticketId,
      event_type: "status_change",
      payload: { from: previousStatus, to: "queued" },
    });

    trace(ticketId, "STATUS_QUEUED");

    // Fetch fresh PR context if we have a PR URL (edge case: relaunching after PR created)
    let prContextSummary: string | undefined;
    if (ticket.pr_url) {
      trace(ticketId, "FETCHING_PR_CONTEXT", { prUrl: ticket.pr_url });
      const parsed = parsePRUrl(ticket.pr_url);
      if (parsed) {
        const prContext = await fetchPRContext(parsed.owner, parsed.repo, parsed.prNumber);
        if (prContext) {
          prContextSummary = formatPRContextSummary(prContext);
          trace(ticketId, "PR_CONTEXT_FETCHED", {
            state: prContext.state,
            reviewDecision: prContext.reviewDecision,
          });
        }
      }
    }

    // 3. Call orchestrator to spawn agent (handles worktree + tmux + MCP config)
    const result = await spawnAgent({
      ticketId,
      agentType,
      repoPath,
      issueType,
      baseBranch,
      jiraCloudId,
      jiraSummary: summary,
      jiraDescription: description,
      jiraUrl,
      status: ticket.status,
      prUrl: ticket.pr_url ?? undefined,
      prNumber: ticket.pr_number ?? undefined,
      prContextSummary,
    });

    if (!result.success) {
      // Revert status on failure
      db.updateTicketStatus(ticketId, "pending");
      db.insertTicketEvent({
        ticket_id: ticketId,
        event_type: "status_change",
        payload: { from: "queued", to: "pending" },
      });

      trace(ticketId, "SPAWN_FAILED", { error: result.error });

      return {
        success: false,
        ticket: db.getTicketById(ticketId),
        error: result.error ?? "Failed to spawn agent",
      };
    }

    // 4. Update ticket with worktree info
    if (result.instance?.worktree) {
      db.updateTicket(ticketId, {
        worktree_path: result.instance.worktree.path,
        branch_name: result.instance.worktree.branch,
        status: "planning",
      });

      db.insertTicketEvent({
        ticket_id: ticketId,
        event_type: "status_change",
        payload: { from: "queued", to: "planning" },
      });

      db.insertTicketEvent({
        ticket_id: ticketId,
        event_type: "agent_started",
        payload: {
          agent: agentType,
          worktreePath: result.instance.worktree.path,
        },
      });
    }

    trace(ticketId, "LAUNCH_SUCCESS");

    return {
      success: true,
      ticket: db.getTicketById(ticketId),
      instance: result.instance,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    trace(ticketId, "LAUNCH_ERROR", { error: errorMsg });

    return {
      success: false,
      ticket: null,
      error: errorMsg,
    };
  }
}
