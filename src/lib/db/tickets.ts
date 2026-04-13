/**
 * Ticket CRUD operations
 */

import { getDatabase } from "./connection.ts";
import type { Ticket, TicketStatus } from "../../types/ticket.ts";
import type { AgentType } from "../../types/config.ts";

/**
 * Insert a new ticket
 */
export function insertTicket(ticket: {
  id: string;
  jira_key: string;
  rig: string;
  jira_url?: string;
  summary?: string;
  agent?: AgentType;
}): Ticket {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO tickets (id, jira_key, rig, jira_url, summary, agent)
    VALUES ($id, $jira_key, $rig, $jira_url, $summary, $agent)
  `);

  stmt.run({
    $id: ticket.id,
    $jira_key: ticket.jira_key,
    $rig: ticket.rig,
    $jira_url: ticket.jira_url ?? null,
    $summary: ticket.summary ?? null,
    $agent: ticket.agent ?? "opencode",
  });

  return getTicketById(ticket.id)!;
}

/**
 * Get a ticket by ID
 */
export function getTicketById(id: string): Ticket | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM tickets WHERE id = ?");
  return stmt.get(id) as Ticket | null;
}

/**
 * Get all tickets for a specific rig
 */
export function getTicketsByRig(rig: string): Ticket[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM tickets WHERE rig = ? ORDER BY created_at DESC");
  return stmt.all(rig) as Ticket[];
}

/**
 * Get all tickets (global view)
 */
export function getAllTickets(): Ticket[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM tickets ORDER BY created_at DESC");
  return stmt.all() as Ticket[];
}

/**
 * Update ticket status
 */
export function updateTicketStatus(id: string, status: TicketStatus): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE tickets
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(status, id);
}

/**
 * Delete a ticket
 */
export function deleteTicket(id: string): void {
  const db = getDatabase();

  // Delete events first (foreign key)
  db.prepare("DELETE FROM ticket_events WHERE ticket_id = ?").run(id);

  // Delete ticket
  db.prepare("DELETE FROM tickets WHERE id = ?").run(id);
}
