/**
 * Database module exports
 *
 * Re-exports all database functions for backward compatibility
 */

// Connection management
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  resetDatabaseRef,
} from "./connection.ts";

// Ticket operations
export {
  insertTicket,
  getTicketById,
  getTicketsByRig,
  getAllTickets,
  updateTicketStatus,
  deleteTicket,
} from "./tickets.ts";

// Ticket partial updates
export { updateTicket } from "./ticket-updates.ts";

// Ticket events
export { insertTicketEvent, getTicketEvents } from "./events.ts";

// Migrations (for testing)
export { migrateTickets } from "./migrations/tickets.ts";
export { migrateNotifications } from "./migrations/notifications.ts";
