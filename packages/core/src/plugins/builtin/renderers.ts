/**
 * Workhorse tool and notification renderers for TUI display.
 *
 * Handles rendering of:
 * - Core Workhorse tools: update_status, escalate, acknowledge
 * - Notifications from various sources (jira, github, agent)
 */

import type { Notification } from "#db";

/**
 * Activity input type for the unified renderer system.
 * Matches TUI's ActivityInput discriminated union.
 */
type ActivityInput =
  | { kind: "notification"; notification: Notification }
  | { kind: "tool"; tool: string; args: unknown };

/**
 * Rendered activity output for TUI display.
 */
interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}

/**
 * Skill loading renderer for TUI display.
 * Handles the load_skill tool.
 */
export function skillRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;
  if (input.tool !== "load_skill") return null;

  return {
    icon: "📖",
    title: `loaded skill: ${String(((input.args ?? {}) as Record<string, unknown>).skillId ?? "unknown")}`,
    style: "inline",
    color: "accent",
  };
}

/**
 * Workhorse tool renderer for TUI display.
 * Handles core Workhorse tools (update_status, escalate, acknowledge).
 * Returns null for other inputs.
 */
export function workhorseToolRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;
  if (!input.tool.startsWith("workhorse_")) return null;

  const args = (input.args ?? {}) as Record<string, unknown>;

  // Status update
  if (input.tool === "workhorse_update_status") {
    const status = String(args.status ?? "?");
    return {
      icon: "⚡",
      title: `status → ${status}`,
      style: "inline",
      color: getStatusColor(status),
    };
  }

  // Escalation
  if (input.tool === "workhorse_escalate") {
    const isBlocking = args.blocking === true;
    return {
      icon: "🚨",
      title: isBlocking ? "BLOCKED" : "escalate",
      body: String(args.message ?? ""),
      style: "box",
      color: isBlocking ? "error" : "warning",
    };
  }

  // Acknowledge
  if (input.tool === "workhorse_acknowledge") {
    return {
      icon: "✓",
      title: "acknowledged notifications",
      style: "inline",
      color: "success",
    };
  }

  // Unknown workhorse_ tool - use default
  return null;
}

/**
 * Notification renderer for TUI display.
 * Generic renderer that works with any notification source.
 */
export function notificationRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "notification") return null;

  const { notification } = input;

  // Determine icon and color based on priority
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

/** Build subtitle from metadata - extracts common fields generically */
function buildSubtitle(source: string, metadata: Record<string, unknown>): string | undefined {
  const parts: string[] = [];

  // Add source
  parts.push(source);

  // Extract common metadata fields that might exist
  const author = metadata.author ?? metadata.user ?? metadata.from;
  if (typeof author === "string") {
    parts.push(author);
  }

  // Extract any reference/key field
  const ref =
    metadata.key ??
    metadata.ref ??
    metadata.issueKey ??
    metadata.prNumber ??
    metadata.ticketId ??
    metadata.id;
  if (ref !== undefined && ref !== null) {
    parts.push(String(ref));
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Get icon and color for notification based on priority */
function getNotificationStyle(priority: string): {
  icon: string;
  color: "info" | "success" | "warning" | "error" | "dim" | "accent";
} {
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

/** Get color for issue status */
function getStatusColor(
  status: string,
): "info" | "success" | "warning" | "error" | "dim" | "accent" {
  switch (status) {
    case "done":
      return "success";
    case "blocked":
      return "error";
    case "in_review":
      return "warning";
    case "implementing":
    case "planning":
      return "info";
    default:
      return "dim";
  }
}
