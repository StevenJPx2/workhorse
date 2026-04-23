import type { Notification } from "#db";

/**
 * Escape special XML characters in text content.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate an XML system inbox from a list of notifications.
 *
 * This format is designed to be included in agent system prompts
 * to notify the agent of pending notifications that need attention.
 *
 * @param notifications - Array of notifications to format
 * @returns XML string representation of the system inbox
 *
 * @example
 * ```typescript
 * const inbox = generateSystemInbox([
 *   { id: "1", priority: "high", source: "jira", title: "New comment", body: "Please review..." }
 * ]);
 * // Returns:
 * // <system_inbox>
 * //   <notification id="1" priority="high" source="jira">
 * //     <title>New comment</title>
 * //     <body>Please review...</body>
 * //   </notification>
 * // </system_inbox>
 * ```
 */
export function generateSystemInbox(notifications: Notification[]): string {
  if (notifications.length === 0) {
    return "<system_inbox />";
  }

  const lines: string[] = ["<system_inbox>"];

  for (const notification of notifications) {
    lines.push(
      `  <notification id="${escapeXml(notification.id)}" priority="${escapeXml(notification.priority)}" source="${escapeXml(notification.source)}">`,
    );
    lines.push(`    <title>${escapeXml(notification.title)}</title>`);
    lines.push(`    <body>${escapeXml(notification.body)}</body>`);
    lines.push("  </notification>");
  }

  lines.push("</system_inbox>");

  return lines.join("\n");
}
