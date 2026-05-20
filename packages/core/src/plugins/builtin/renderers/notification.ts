/**
 * Notification renderer for TUI display.
 * Generic renderer that works with any notification source.
 */

import type { ActivityColor, ActivityInput, RenderedActivity } from "./types.ts";

/** Get icon and color for notification based on priority */
function getNotificationStyle(priority: string): { icon: string; color: ActivityColor } {
  switch (priority) {
    case "blocking":
      return { icon: "🚫", color: "error" };
    case "high":
      return { icon: "❗", color: "warning" };
    case "normal":
      return { icon: "📬", color: "info" };
    case "low":
      return { icon: "📭", color: "dim" };
    default:
      return { icon: "📬", color: "dim" };
  }
}

/** Build subtitle from metadata - extracts common fields generically */
function buildSubtitle(source: string, metadata: Record<string, unknown>): string | undefined {
  const parts: string[] = [source];

  const author = metadata.author ?? metadata.user ?? metadata.from;
  if (typeof author === "string") parts.push(author);

  const ref =
    metadata.key ??
    metadata.ref ??
    metadata.issueKey ??
    metadata.prNumber ??
    metadata.ticketId ??
    metadata.id;
  if (ref !== undefined && ref !== null) parts.push(String(ref));

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Notification renderer for TUI display. */
export function notificationRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;

  const { notification } = input;
  const { icon, color } = getNotificationStyle(notification.priority);

  return {
    icon,
    title: notification.title,
    subtitle: buildSubtitle(
      notification.source,
      (notification.metadata ?? {}) as Record<string, unknown>,
    ),
    body: notification.body,
    style: notification.priority === "blocking" ? "box" : "inline",
    color,
  };
}
