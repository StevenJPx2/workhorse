/**
 * jiratown_get_notifications tool handler
 *
 * Returns pending notifications for a ticket and generates a system instruction
 * to summarize high-priority items.
 */

import type { Database } from "bun:sqlite";
import {
  getUnreadNotifications,
  markNotificationRead,
  generateSystemInstruction,
} from "../../notifications/index.ts";
import type { GetNotificationsResponse } from "../types.ts";

/**
 * Handle the jiratown_get_notifications tool call
 *
 * - Retrieves unread notifications for the ticket
 * - Marks them as read (agent has seen them)
 * - Generates a system instruction if there are high-priority items
 */
export function handleGetNotifications(db: Database, ticketId: string): GetNotificationsResponse {
  // Get unread notifications ordered by priority
  const notifications = getUnreadNotifications(db, ticketId);

  // Mark all as read since the agent is now seeing them
  for (const notif of notifications) {
    markNotificationRead(db, notif.id);
  }

  // Generate system instruction for high-priority items
  const system_instruction = generateSystemInstruction(notifications);

  return {
    notifications,
    system_instruction,
  };
}
