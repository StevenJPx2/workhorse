import type { Ticket } from "../../types/ticket.ts";
import {
  getTicketById,
  updateTicketStatus,
  updateTicket,
} from "../../lib/db/index.ts";
import type { StartWorkOptions } from "./types.ts";
import type { WorkflowDeps } from "./workflow-deps.ts";

export function createStartWork(deps: WorkflowDeps) {
  return async (opts: StartWorkOptions): Promise<Ticket | null> => {
    try {
      deps.setIsLoading(true);
      deps.setError(null);

      const ticket = getTicketById(opts.ticketId);
      if (!ticket) {
        deps.handleError(new Error(`Ticket not found: ${opts.ticketId}`));
        return null;
      }

      updateTicketStatus(ticket.id, "queued");

      const instance = await deps.agent.spawn({
        ticketId: ticket.id,
        agentType: opts.agent,
        issueType: opts.jiraIssue.issueType,
        summary: opts.jiraIssue.summary,
        description: opts.jiraIssue.description ?? undefined,
        jiraUrl: opts.jiraIssue.url,
      });

      if (!instance) {
        updateTicketStatus(ticket.id, "pending");
        deps.handleError(new Error("Failed to spawn agent"));
        return getTicketById(ticket.id);
      }

      if (instance.worktree) {
        updateTicket(ticket.id, {
          worktree_path: instance.worktree.path,
          branch_name: instance.worktree.branch,
          status: "planning",
        });
      }

      return getTicketById(ticket.id);
    } catch (err) {
      deps.handleError(err);
      return null;
    } finally {
      deps.setIsLoading(false);
    }
  };
}

export function createStopWork(deps: WorkflowDeps) {
  return async (ticketId: string, removeWorktree: boolean = false): Promise<boolean> => {
    try {
      deps.setIsLoading(true);
      deps.setError(null);

      const stopped = await deps.agent.stop(ticketId, removeWorktree);

      if (stopped) {
        updateTicketStatus(ticketId, "pending");
        updateTicket(ticketId, { agent_pid: null });
      }

      return stopped;
    } catch (err) {
      deps.handleError(err);
      return false;
    } finally {
      deps.setIsLoading(false);
    }
  };
}