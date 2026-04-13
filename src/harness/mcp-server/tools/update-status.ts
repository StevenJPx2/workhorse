/**
 * jiratown_update_status tool handler
 *
 * Updates the ticket's status and returns the previous/new status.
 */

import type { Database } from "bun:sqlite";
import type { UpdateStatusInput, UpdateStatusResponse } from "../types.ts";

interface TicketRow {
  id: string;
  status: string;
}

/**
 * Handle the jiratown_update_status tool call
 *
 * Updates the ticket status in the database.
 * The optional message is logged but not stored.
 */
export function handleUpdateStatus(
  db: Database,
  ticketId: string,
  input: UpdateStatusInput,
): UpdateStatusResponse {
  // Get current ticket status
  const ticket = db
    .prepare("SELECT id, status FROM tickets WHERE id = ?")
    .get(ticketId) as TicketRow | null;

  if (!ticket) {
    return {
      success: false,
      previous_status: "",
      new_status: "",
    };
  }

  const previousStatus = ticket.status;

  // Update status
  db.prepare("UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    input.status,
    ticketId,
  );

  // Log message if provided (for debugging/audit)
  if (input.message) {
    // In a full implementation, this could log to ticket_events table
    // For now, we just accept it without storing
  }

  return {
    success: true,
    previous_status: previousStatus,
    new_status: input.status,
  };
}
