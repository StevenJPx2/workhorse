/**
 * Jira renderer for TUI display.
 *
 * Handles Jira notifications in the unified activity renderer system.
 */

import type { Notification } from "@jiratown/core";

/**
 * Activity input type for the unified renderer system.
 */
export type ActivityInput =
  | { kind: "notification"; notification: Notification }
  | { kind: "tool"; tool: string; args: unknown };

/**
 * Rendered activity output for TUI display.
 */
export interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}

/**
 * Jira renderer for TUI display.
 * Handles Jira notifications; returns null for other inputs.
 */
export function jiraRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;
  if (input.notification.source !== "jira") return null;

  const notification = input.notification;
  const meta = notification.metadata as Record<string, unknown> | undefined;
  const jiraKey = meta?.jiraKey as string | undefined;
  const author = meta?.author as string | undefined;

  // Determine icon based on notification type/content
  let icon = "🎫"; // Default Jira ticket icon
  if (notification.title.toLowerCase().includes("comment")) {
    icon = "💬";
  } else if (notification.title.toLowerCase().includes("transition")) {
    icon = "➡️";
  } else if (notification.title.toLowerCase().includes("assign")) {
    icon = "👤";
  }

  // Build subtitle with Jira key and author
  const subtitleParts: string[] = [];
  if (jiraKey) subtitleParts.push(jiraKey);
  if (author) subtitleParts.push(`by ${author}`);

  return {
    icon,
    title: notification.title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined,
    body: notification.body ?? undefined,
    style: "box",
  };
}
