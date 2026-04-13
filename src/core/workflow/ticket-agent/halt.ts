/**
 * Halt an agent working on a ticket
 */

import type { HaltTicketAgentOptions, HaltResult, DatabaseOperations } from "../types.ts";
import { stopAgent } from "../../agent/orchestrator/index.ts";
import { trace } from "./trace.ts";

export async function haltTicketAgent(
  ticketId: string,
  repoPath: string,
  db: DatabaseOperations,
  options: HaltTicketAgentOptions = {},
): Promise<HaltResult> {
  const { removeWorktree = false } = options;

  trace(ticketId, "HALT_START", { removeWorktree });

  try {
    const ticket = db.getTicketById(ticketId);
    const previousStatus = ticket?.status ?? "implementing";

    // Call orchestrator to stop agent
    const result = await stopAgent(ticketId, repoPath, removeWorktree);

    if (!result.success) {
      trace(ticketId, "HALT_FAILED", { error: result.error });
      return {
        success: false,
        error: result.error ?? "Failed to stop agent",
      };
    }

    // Update ticket
    db.updateTicketStatus(ticketId, "pending");
    db.updateTicket(ticketId, { agent_pid: null });

    // Record events
    db.insertTicketEvent({
      ticket_id: ticketId,
      event_type: "status_change",
      payload: { from: previousStatus, to: "pending" },
    });

    db.insertTicketEvent({
      ticket_id: ticketId,
      event_type: "agent_stopped",
      payload: { reason: removeWorktree ? "removed" : "stopped" },
    });

    trace(ticketId, "HALT_SUCCESS");

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    trace(ticketId, "HALT_ERROR", { error: errorMsg });

    return {
      success: false,
      error: errorMsg,
    };
  }
}
