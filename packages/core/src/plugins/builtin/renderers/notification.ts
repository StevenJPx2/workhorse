/**
 * Notification renderer for TUI display.
 * Generic renderer that works with any notification source.
 */

import type { ActivityColor, ActivityInput, RenderedActivity } from "./types.ts";

/** Notification renderer for TUI display. */
export function notificationRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;

  const { notification } = input;

  // Get icon and color for notification based on priority
  const { icon, color }: { icon: string; color: ActivityColor } = (
    {
      blocking: { icon: "🚫", color: "error" },
      high: { icon: "❗", color: "warning" },
      normal: { icon: "📬", color: "info" },
      low: { icon: "📭", color: "dim" },
    } as Record<string, { icon: string; color: ActivityColor }>
  )[notification.priority] ?? { icon: "📬", color: "dim" };

  // Build subtitle from metadata - extracts common fields generically
  const parts: string[] = [notification.source];
  const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
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

  return {
    icon,
    title: notification.title,
    subtitle: parts.length > 0 ? parts.join(" · ") : undefined,
    body: notification.body,
    style: notification.priority === "blocking" ? "box" : "inline",
    color,
  };
}
