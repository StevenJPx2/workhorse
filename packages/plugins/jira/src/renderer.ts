/**
 * Jira renderer for TUI display.
 *
 * Handles Jira notifications and tool calls in the unified activity
 * renderer system.
 *
 * @module workhorse-plugin-jira/renderer
 */

import type { Notification } from "workhorse-core";

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
 * Handles Jira notifications and tool calls; returns null for other inputs.
 */
export function jiraRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind === "notification") {
    return renderNotification(input.notification);
  }

  if (input.kind === "tool") {
    return renderTool(input.tool, input.args);
  }

  return null;
}

// Notification rendering

function renderNotification(notification: Notification): RenderedActivity | null {
  if (notification.source !== "jira") return null;

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

// Tool-call rendering

function renderTool(tool: string, args: unknown): RenderedActivity | null {
  if (!tool.startsWith("jira_")) return null;

  const toolArgs = (args ?? {}) as Record<string, unknown>;

  switch (tool) {
    case "jira_add_comment":
      return {
        icon: "💬",
        title: toolArgs.replyToId ? "Replying on Jira" : "Adding Jira comment",
        subtitle: truncate(String(toolArgs.body ?? ""), 60),
        style: "inline",
        color: "accent",
      };

    case "jira_get_comments":
      return {
        icon: "💬",
        title: "Fetching Jira comments",
        style: "inline",
        color: "dim",
      };

    case "jira_get_attachments":
      return {
        icon: "📎",
        title: "Downloading Jira attachments",
        subtitle: toolArgs.imagesOnly === true ? "images only" : undefined,
        style: "inline",
        color: "dim",
      };

    case "jira_transition_issue": {
      const status = String(toolArgs.status ?? "");
      return {
        icon: "➡️",
        title: "Transitioning Jira issue",
        subtitle: status ? `→ ${status}` : undefined,
        style: "inline",
        color: "info",
      };
    }

    default:
      return null;
  }
}

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}
