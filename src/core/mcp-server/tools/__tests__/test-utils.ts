/**
 * Test utilities for MCP server tools
 *
 * Provides helper functions for setting up test databases with tickets.
 */

import type { Database } from "bun:sqlite";

export interface TestTicket {
  id: string;
  jira_key: string;
  rig: string;
  status?: string;
  jira_url?: string;
  summary?: string;
  agent?: string;
}

/**
 * Initialize tickets table in test database
 */
export function initTicketsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL,
      jira_url TEXT,
      summary TEXT,
      status TEXT DEFAULT 'pending',
      rig TEXT NOT NULL,
      worktree_path TEXT,
      branch_name TEXT,
      agent TEXT DEFAULT 'opencode',
      agent_pid INTEGER,
      pr_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_jira_sync TEXT
    );
  `);
}

/**
 * Insert a test ticket
 */
export function insertTicket(db: Database, ticket: TestTicket): void {
  db.prepare(`
    INSERT INTO tickets (id, jira_key, rig, status, jira_url, summary, agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.id,
    ticket.jira_key,
    ticket.rig,
    ticket.status ?? "pending",
    ticket.jira_url ?? null,
    ticket.summary ?? null,
    ticket.agent ?? "opencode",
  );
}

/**
 * Get a ticket by ID
 */
export function getTicketById(db: Database, id: string): (TestTicket & { status: string }) | null {
  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as
    | (TestTicket & { status: string })
    | null;
}
