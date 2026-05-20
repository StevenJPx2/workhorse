/**
 * GitHub notification renderer for TUI display.
 *
 * @module workhorse-plugin-github/renderer/notification
 */

import type { Notification } from "workhorse-core";

import type { RenderedActivity } from "./types.ts";

/**
 * Render GitHub notifications.
 * Returns null for non-GitHub notifications.
 */
export function renderGithubNotification(notification: Notification): RenderedActivity | null {
  if (notification.source !== "github") return null;

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
