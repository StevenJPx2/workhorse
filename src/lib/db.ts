/**
 * SQLite database for Jiratown
 *
 * Uses Bun's built-in SQLite for performance and zero dependencies
 */

import { Database } from "bun:sqlite";
import { getConfigPaths, ensureConfigDir } from "./config.ts";
import type { Ticket, TicketEvent, TicketStatus } from "../types/ticket.ts";
import type { AgentType } from "../types/config.ts";

let db: Database | null = null;

/**
 * Initialize the database and run migrations
 */
export function initDatabase(): Database {
  if (db) {
    return db;
  }

  ensureConfigDir();
  const paths = getConfigPaths();

  db = new Database(paths.database);
  db.exec("PRAGMA journal_mode = WAL");

  // Run migrations
  migrate(db);

  return db;
}

/**
 * Get the database instance (must be initialized first)
 */
export function getDatabase(): Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run database migrations
 */
function migrate(database: Database): void {
  // Create tickets table
  database.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL,
      jira_url TEXT,
      summary TEXT,
      status TEXT DEFAULT 'pending',
      
      -- Gas Town integration
      bead_id TEXT,
      rig TEXT NOT NULL,
      worktree_path TEXT,
      
      -- Agent config
      agent TEXT DEFAULT 'opencode',
      polecat_id TEXT,
      
      -- PR tracking
      pr_url TEXT,
      
      -- Timestamps
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      
      -- Jira sync state
      last_jira_sync TEXT
    );
  `);

  // Create ticket_events table
  database.exec(`
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT REFERENCES tickets(id),
      event_type TEXT,
      payload TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_rig ON tickets(rig);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id);
  `);
}

// ============================================================================
// Ticket CRUD operations
// ============================================================================

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
 * Update ticket fields
 */
export function updateTicket(
  id: string,
  updates: Partial<
    Pick<
      Ticket,
      | "summary"
      | "jira_url"
      | "bead_id"
      | "worktree_path"
      | "agent"
      | "polecat_id"
      | "pr_url"
      | "last_jira_sync"
      | "status"
    >
  >
): void {
  const db = getDatabase();

  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (updates.summary !== undefined) {
    fields.push("summary = ?");
    values.push(updates.summary);
  }
  if (updates.jira_url !== undefined) {
    fields.push("jira_url = ?");
    values.push(updates.jira_url);
  }
  if (updates.bead_id !== undefined) {
    fields.push("bead_id = ?");
    values.push(updates.bead_id);
  }
  if (updates.worktree_path !== undefined) {
    fields.push("worktree_path = ?");
    values.push(updates.worktree_path);
  }
  if (updates.agent !== undefined) {
    fields.push("agent = ?");
    values.push(updates.agent);
  }
  if (updates.polecat_id !== undefined) {
    fields.push("polecat_id = ?");
    values.push(updates.polecat_id);
  }
  if (updates.pr_url !== undefined) {
    fields.push("pr_url = ?");
    values.push(updates.pr_url);
  }
  if (updates.last_jira_sync !== undefined) {
    fields.push("last_jira_sync = ?");
    values.push(updates.last_jira_sync);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return;
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const sql = `UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...values);
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

// ============================================================================
// Ticket Events
// ============================================================================

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

  stmt.run(
    event.ticket_id,
    event.event_type,
    JSON.stringify(event.payload)
  );

  // Get the last inserted row
  const lastId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };

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
