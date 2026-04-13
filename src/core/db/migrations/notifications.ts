/**
 * Notifications table migration
 */

import type { Database } from "bun:sqlite";

/**
 * Run migrations for notifications table
 */
export function migrateNotifications(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      
      -- Source identification (for deduplication)
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      
      -- Content
      priority TEXT NOT NULL DEFAULT 'normal',
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT,
      metadata TEXT,
      
      -- State
      status TEXT NOT NULL DEFAULT 'unread',
      read_at TEXT,
      acknowledged_at TEXT,
      
      -- Timestamps
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source_timestamp TEXT
    );
  `);

  // Create indexes
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_source 
    ON notifications(source_type, source_id);
    
    CREATE INDEX IF NOT EXISTS idx_notifications_ticket 
    ON notifications(ticket_id);
    
    CREATE INDEX IF NOT EXISTS idx_notifications_status 
    ON notifications(status);
    
    CREATE INDEX IF NOT EXISTS idx_notifications_priority 
    ON notifications(priority);
  `);
}
