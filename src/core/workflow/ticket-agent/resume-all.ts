/**
 * Resume all tickets in active states
 */

import type { DatabaseOperations } from "../types.ts";
import { isAgentRunning } from "./is-agent-running.ts";
import { restartTicketAgent } from "./restart.ts";

export const ACTIVE_TICKET_STATUSES = ["planning", "implementing", "queued"] as const;

export async function resumeAllTicketAgents(
  repoPath: string,
  db: DatabaseOperations,
  jiraCloudId?: string,
): Promise<number> {
  const allTickets = db.getAllTickets();
  const activeTickets = allTickets.filter((t) =>
    ACTIVE_TICKET_STATUSES.includes(t.status as (typeof ACTIVE_TICKET_STATUSES)[number]),
  );

  let resumed = 0;

  for (const ticket of activeTickets) {
    // Skip if already running
    if (isAgentRunning(ticket.id)) {
      resumed++;
      continue;
    }

    const result = await restartTicketAgent(ticket.id, repoPath, db, jiraCloudId);

    if (result.success) {
      resumed++;
    }
  }

  return resumed;
}
