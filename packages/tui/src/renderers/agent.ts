/**
 * Agent notification renderer for TUI display.
 *
 * Handles agent-generated notifications (escalations, status updates).
 */

import type { Notification } from "@jiratown/core";
import type { ActivityInput, RenderedActivity } from "./types.ts";

/**
 * Agent renderer for TUI display.
 * Handles agent notifications; returns null for other inputs.
 */
export function agentRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;
  if (input.notification.source !== "agent") return null;

  const notification = input.notification as Notification;
  const meta = notification.metadata as Record<string, unknown> | undefined;
  const isBlocking = meta?.blocking === true;
  const notificationType = meta?.type as string | undefined;

  // Determine icon based on notification type and priority
  let icon = "🤖"; // Default agent icon
  if (isBlocking) {
    icon = "🚨"; // Blocking escalation
  } else if (notificationType === "escalation") {
    icon = "❓"; // Non-blocking question
  } else if (notification.priority === "high") {
    icon = "⚠️";
  }

  // Build subtitle based on priority/type
  let subtitle: string | undefined;
  if (isBlocking) {
    subtitle = "Blocking • Agent paused";
  } else if (notificationType === "escalation") {
    subtitle = "Question from agent";
  }

  return {
    icon,
    title: notification.title,
    subtitle,
    body: notification.body ?? undefined,
    style: "box",
  };
}
