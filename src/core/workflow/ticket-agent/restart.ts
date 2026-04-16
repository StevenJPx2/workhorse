/**
 * Restart an agent for an existing ticket
 */

import type { LaunchResult, DatabaseOperations } from "../types.ts";
import { spawnAgent, stopAgent } from "../../agent/orchestrator/index.ts";
import { trace } from "./trace.ts";
import { isAgentRunning } from "./is-agent-running.ts";
import { fetchPRContext, parsePRUrl, formatPRContextSummary } from "../../github/index.ts";
import {
  fetchJiraTicketContext,
  formatJiraContextSummary,
  createAtlassianClient,
} from "../../jira/index.ts";

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

    // Fetch fresh context from GitHub and Jira before resuming
    let prContextSummary: string | undefined;
    let jiraContextSummary: string | undefined;

    // Fetch fresh PR context if we have a PR URL
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

    // Fetch fresh Jira context if we have a cloud ID
    if (jiraCloudId) {
      trace(ticketId, "FETCHING_JIRA_CONTEXT");
      try {
        const client = createAtlassianClient({ cloudId: jiraCloudId });
        await client.connect();
        const jiraContext = await fetchJiraTicketContext(client, ticketId);
        if (jiraContext) {
          jiraContextSummary = formatJiraContextSummary(jiraContext);
          trace(ticketId, "JIRA_CONTEXT_FETCHED", { status: jiraContext.status });
        }
        await client.disconnect();
      } catch (err) {
        trace(ticketId, "JIRA_CONTEXT_FAILED", {
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue without Jira context - not fatal
      }
    }

    // Re-spawn with existing ticket data and fresh context
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
      prNumber: ticket.pr_number ?? undefined,
      prContextSummary,
      jiraContextSummary,
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
