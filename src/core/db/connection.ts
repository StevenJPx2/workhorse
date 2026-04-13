/**
 * Database connection management
 */

import { Database } from "bun:sqlite";
import { getConfigPaths, ensureConfigDir } from "../config/index.ts";
import { migrateTickets } from "./migrations/tickets.ts";
import { migrateNotifications } from "./migrations/notifications.ts";

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
  migrateTickets(db);
  migrateNotifications(db);

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
 * Reset database reference (for testing)
 */
export function resetDatabaseRef(): void {
  db = null;
}
