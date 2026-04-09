import type { TicketStatus } from "../../types/ticket.ts";
import { getTicketById, getAllTickets, updateTicket } from "../../lib/db/index.ts";
import type { WorkflowDeps } from "./workflow-deps.ts";

const trace = (tid: string, step: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  const traceLine = `[${timestamp}] restartAgent[${tid}] ${step}${data ? `: ${JSON.stringify(data)}` : ""}\n`;
  try {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const tracePath = path.join(os.tmpdir(), "jiratown-trace.log");
    fs.appendFileSync(tracePath, traceLine);
  } catch {}
  console.log(traceLine.trim());
};

export function createRestartAgent(deps: WorkflowDeps) {
  return async (ticketId: string): Promise<boolean> => {
    trace(ticketId, "START", { ticketId });

    try {
      deps.setIsLoading(true);
      deps.setError(null);

      const ticket = getTicketById(ticketId);
      trace(ticketId, "GOT_TICKET", { found: !!ticket, agent: ticket?.agent });

      if (!ticket) {
        deps.handleError(new Error(`Ticket not found: ${ticketId}`));
        return false;
      }

      const wasRunning = deps.agent.isRunning(ticketId);
      trace(ticketId, "CHECK_RUNNING", { wasRunning });

      if (wasRunning) {
        trace(ticketId, "STOPPING_AGENT");
        const stopped = await deps.agent.stop(ticketId, false);
        trace(ticketId, "STOPPED", { stopped });
      }

      trace(ticketId, "SPAWNING", { agentType: ticket.agent, summary: ticket.summary, jiraUrl: ticket.jira_url });
      const instance = await deps.agent.spawn({
        ticketId: ticket.id,
        agentType: ticket.agent,
        issueType: "Task",
        summary: ticket.summary ?? undefined,
        description: undefined,
        jiraUrl: ticket.jira_url ?? undefined,
      });

      trace(ticketId, "SPAWN_RESULT", { success: !!instance, worktree: !!instance?.worktree });

      if (!instance) {
        deps.handleError(new Error("Failed to restart agent"));
        return false;
      }

      if (instance.worktree) {
        trace(ticketId, "UPDATING_TICKET", { path: instance.worktree.path, branch: instance.worktree.branch });
        updateTicket(ticket.id, {
          worktree_path: instance.worktree.path,
          branch_name: instance.worktree.branch,
          status: "planning",
        });
      }

      trace(ticketId, "SUCCESS");
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      trace(ticketId, "ERROR", { error: errorMsg });
      deps.handleError(err);
      return false;
    } finally {
      deps.setIsLoading(false);
    }
  };
}

const ACTIVE_STATUSES: TicketStatus[] = ["planning", "implementing", "queued"];

export function createResumeAllAgents(
  deps: WorkflowDeps,
  restartAgent: (ticketId: string) => Promise<boolean>
) {
  return async (): Promise<number> => {
    const allTickets = getAllTickets();
    const activeTickets = allTickets.filter((t) =>
      ACTIVE_STATUSES.includes(t.status)
    );

    let resumed = 0;
    for (const ticket of activeTickets) {
      if (deps.agent.isRunning(ticket.id)) {
        resumed++;
        continue;
      }

      const success = await restartAgent(ticket.id);
      if (success) {
        resumed++;
      }
    }

    return resumed;
  };
}