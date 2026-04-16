/**
 * System instruction generator
 *
 * Generates <system-instruction> and <system_inbox> blocks to inject into agent conversations
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
export function generateSystemInstruction(notifications: Notification[]): string | null {
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
    parts.push(`BLOCKING: ${blocking.length} item(s) require immediate attention:`);
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
    "Call jiratown_get_notifications for details, then jiratown_acknowledge when addressed.",
  );
  parts.push("</system-instruction>");

  return parts.join("\n");
}

/**
 * Format a single notification item for display in system inbox
 */
function formatNotificationItem(notif: Notification): string {
  const lines: string[] = [];
  lines.push(`  <item id="${notif.id}" type="${notif.source_type}" priority="${notif.priority}">`);
  lines.push(`    <summary>${notif.summary}</summary>`);
  if (notif.content) {
    lines.push(`    <content>${notif.content}</content>`);
  }
  if (notif.author) {
    lines.push(`    <author>${notif.author}</author>`);
  }
  lines.push(`  </item>`);
  return lines.join("\n");
}

/**
 * Generate a system inbox block to push to the agent when new notifications arrive.
 *
 * Unlike generateSystemInstruction (which tells the agent to fetch notifications),
 * this provides the full notification content directly to the agent.
 *
 * The agent should call jiratown_acknowledge with the notification IDs after
 * addressing them.
 *
 * Returns null if there are no notifications.
 */
export function generateSystemInbox(notifications: Notification[]): string | null {
  if (notifications.length === 0) {
    return null;
  }

  const blocking = notifications.filter((n) => n.priority === "blocking");
  const high = notifications.filter((n) => n.priority === "high");
  const normal = notifications.filter((n) => n.priority === "normal");
  const low = notifications.filter((n) => n.priority === "low");

  const parts: string[] = ["<system_inbox>"];

  // Add blocking notifications
  if (blocking.length > 0) {
    parts.push(`<blocking count="${blocking.length}">`);
    for (const notif of blocking) {
      parts.push(formatNotificationItem(notif));
    }
    parts.push("</blocking>");
  }

  // Add high priority notifications
  if (high.length > 0) {
    parts.push(`<high_priority count="${high.length}">`);
    for (const notif of high) {
      parts.push(formatNotificationItem(notif));
    }
    parts.push("</high_priority>");
  }

  // Add normal priority notifications
  if (normal.length > 0) {
    parts.push(`<normal_priority count="${normal.length}">`);
    for (const notif of normal) {
      parts.push(formatNotificationItem(notif));
    }
    parts.push("</normal_priority>");
  }

  // Add low priority notifications
  if (low.length > 0) {
    parts.push(`<low_priority count="${low.length}">`);
    for (const notif of low) {
      parts.push(formatNotificationItem(notif));
    }
    parts.push("</low_priority>");
  }

  // Add guidance for acknowledging
  const allIds = notifications.map((n) => n.id);
  parts.push("");
  parts.push(
    `<action>After addressing these items, call jiratown_acknowledge with notification_ids: ${JSON.stringify(allIds)}</action>`,
  );
  parts.push("</system_inbox>");

  return parts.join("\n");
}
