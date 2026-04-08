/**
 * jiratown_acknowledge tool handler
 *
 * Marks notifications as acknowledged after the agent has addressed them.
 */

import type { Database } from "bun:sqlite";
import {
  acknowledgeNotifications,
  getNotificationById,
} from "../../notifications/index.ts";
import type { AcknowledgeInput, AcknowledgeResponse } from "../types.ts";

/**
 * Handle the jiratown_acknowledge tool call
 *
 * Marks the specified notifications as acknowledged.
 * Returns the count of successfully acknowledged notifications.
 */
export function handleAcknowledge(
  db: Database,
  input: AcknowledgeInput
): AcknowledgeResponse {
  const { notification_ids } = input;

  if (notification_ids.length === 0) {
    return { acknowledged_count: 0 };
  }

  // Count how many exist before acknowledging
  let existingCount = 0;
  for (const id of notification_ids) {
    if (getNotificationById(db, id)) {
      existingCount++;
    }
  }

  // Acknowledge all
  acknowledgeNotifications(db, notification_ids);

  return { acknowledged_count: existingCount };
}
