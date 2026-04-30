import type { Notification } from "@jiratown/core";
import type { RenderedNotification } from "./types.ts";

/**
 * Default fallback renderer for unknown notification types.
 */
export function defaultRenderer(notification: Notification): RenderedNotification {
  return {
    icon: "📩",
    title: notification.title,
    body: notification.body ?? undefined,
    style: "box",
  };
}
