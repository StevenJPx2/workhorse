/**
 * Ticket events operations
 */

import { getDatabase } from "./connection.ts";
import type { TicketEvent } from "#types/ticket.ts";

/**
 * Insert a ticket event
 */
export function insertTicketEvent(event: {
  ticket_id: string;
  event_type: string;
  payload: object;
}): TicketEvent {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO ticket_events (ticket_id, event_type, payload)
    VALUES (?, ?, ?)
  `);

  stmt.run(event.ticket_id, event.event_type, JSON.stringify(event.payload));

  // Get the last inserted row
  const lastId = db.prepare("SELECT last_insert_rowid() as id").get() as {
    id: number;
  };

  return {
    id: lastId.id,
    ticket_id: event.ticket_id,
    event_type: event.event_type,
    payload: JSON.stringify(event.payload),
    timestamp: new Date().toISOString(),
  } as TicketEvent;
}

/**
 * Get events for a ticket
 */
export function getTicketEvents(ticketId: string): TicketEvent[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM ticket_events
    WHERE ticket_id = ?
    ORDER BY timestamp DESC
  `);
  return stmt.all(ticketId) as TicketEvent[];
}
