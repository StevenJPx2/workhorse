/**
 * GitHub renderer for TUI display.
 *
 * Handles GitHub notifications in the unified activity renderer system.
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
 * GitHub renderer for TUI display.
 * Handles GitHub notifications; returns null for other inputs.
 */
export function githubRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;
  if (input.notification.source !== "github") return null;

  const notification = input.notification;
  const meta = notification.metadata as Record<string, unknown> | undefined;
  const owner = meta?.owner as string | undefined;
  const repo = meta?.repo as string | undefined;
  const prNumber = meta?.prNumber as number | undefined;
  const author = meta?.author as string | undefined;
  const state = meta?.state as string | undefined;

  // Determine icon based on notification type
  let icon = "🐙"; // Default GitHub icon
  const titleLower = notification.title.toLowerCase();

  if (titleLower.includes("review")) {
    // Review state icons
    if (state === "APPROVED") {
      icon = "✅";
    } else if (state === "CHANGES_REQUESTED") {
      icon = "🔴";
    } else {
      icon = "👀";
    }
  } else if (titleLower.includes("comment")) {
    icon = "💬";
  } else if (titleLower.includes("check") || titleLower.includes("ci")) {
    if (titleLower.includes("pass") || titleLower.includes("success")) {
      icon = "✅";
    } else if (titleLower.includes("fail")) {
      icon = "❌";
    } else {
      icon = "⏳";
    }
  } else if (titleLower.includes("merge conflict")) {
    icon = "⚠️";
  } else if (titleLower.includes("behind")) {
    icon = "📉";
  }

  // Build subtitle with repo and PR info
  const subtitleParts: string[] = [];
  if (owner && repo) {
    subtitleParts.push(`${owner}/${repo}`);
  }
  if (prNumber) {
    subtitleParts.push(`#${prNumber}`);
  }
  if (author) {
    subtitleParts.push(`by ${author}`);
  }

  // Truncate body for review comments with diff hunks
  let body = notification.body ?? undefined;
  if (body && meta?.diffHunk) {
    // Show just the comment, not the diff hunk
    body = body.split("\n").slice(0, 5).join("\n");
    if (notification.body && notification.body.split("\n").length > 5) {
      body += "\n...";
    }
  }

  return {
    icon,
    title: notification.title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined,
    body,
    style: "box",
  };
}
