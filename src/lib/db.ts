/**
 * Database module - Re-exports from db/ folder
 *
 * This file maintains backward compatibility for existing imports.
 * All implementations have been moved to src/lib/db/ folder.
 */

export {
  // Connection management
  initDatabase,
  getDatabase,
  closeDatabase,
  resetDatabaseRef,
  // Ticket operations
  insertTicket,
  getTicketById,
  getTicketsByRig,
  getAllTickets,
  updateTicketStatus,
  deleteTicket,
  updateTicket,
  // Ticket events
  insertTicketEvent,
  getTicketEvents,
  // Migrations
  migrateTickets,
  migrateNotifications,
} from "./db/index.ts";
