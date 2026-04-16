/**
 * Tickets table migration
 */

import type { Database } from "bun:sqlite";

/**
 * Run migrations for tickets and ticket_events tables
 */
export function migrateTickets(database: Database): void {
  // Create tickets table
  database.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL,
      jira_url TEXT,
      summary TEXT,
      status TEXT DEFAULT 'pending',
      
      -- Worktree integration
      rig TEXT NOT NULL,
      worktree_path TEXT,
      branch_name TEXT,
      
      -- Agent config
      agent TEXT DEFAULT 'opencode',
      agent_pid INTEGER,
      
      -- PR tracking
      pr_url TEXT,
      pr_number INTEGER,
      
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
