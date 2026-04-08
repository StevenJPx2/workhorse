/**
 * System instruction generator
 *
 * Generates <system-instruction> blocks to inject into agent conversations
 * based on pending notifications.
 */

import type { Notification } from "./types.ts";

/**
 * Generate a system instruction block for the agent based on notifications.
 *
 * The instruction summarizes pending notifications by priority:
 * - Blocking: Listed with full summaries (requires immediate attention)
 * - High: Listed with full summaries
 * - Normal: Only count shown
 * - Low: Not included (agent checks when convenient)
 *
 * Returns null if there are no notifications that warrant an instruction.
 */
export function generateSystemInstruction(
  notifications: Notification[]
): string | null {
  const blocking = notifications.filter((n) => n.priority === "blocking");
  const high = notifications.filter((n) => n.priority === "high");
  const normal = notifications.filter((n) => n.priority === "normal");
  // Low priority notifications don't generate system instructions

  // No instruction needed if only low priority or no notifications
  if (blocking.length === 0 && high.length === 0 && normal.length === 0) {
    return null;
  }

  const parts: string[] = ["<system-instruction>"];

  // Blocking notifications - highest priority, full details
  if (blocking.length > 0) {
    parts.push(
      `BLOCKING: ${blocking.length} item(s) require immediate attention:`
    );
    for (const notif of blocking) {
      parts.push(`  - ${notif.summary}`);
    }
    parts.push("");
  }

  // High priority notifications - listed with summaries
  if (high.length > 0) {
    parts.push(`${high.length} high-priority notification(s):`);
    for (const notif of high) {
      parts.push(`  - ${notif.summary}`);
    }
    parts.push("");
  }

  // Normal priority - just count
  if (normal.length > 0) {
    parts.push(`${normal.length} other notification(s) pending.`);
    parts.push("");
  }

  // Action guidance
  parts.push(
    "Call jiratown_get_notifications for details, then jiratown_acknowledge when addressed."
  );
  parts.push("</system-instruction>");

  return parts.join("\n");
}
