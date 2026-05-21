/**
 * Figma renderer for TUI display.
 *
 * Handles Figma notifications and tool calls in the unified activity
 * renderer system.
 *
 * @module workhorse-plugin-figma/renderer
 */
import type { Notification } from "workhorse-core";

/** Activity input type for the unified renderer system */
export type ActivityInput =
  | { kind: "notification"; notification: Notification }
  | { kind: "tool"; tool: string; args: unknown };

/** Rendered activity output for TUI display */
export interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}

/**
 * Figma renderer — handles Figma notifications and tool calls.
 * Returns null for inputs that belong to other plugins.
 */
export function figmaRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind === "notification") {
    return renderNotification(input.notification);
  }

  if (input.kind === "tool") {
    return renderTool(input.tool, input.args);
  }

  return null;
}

// Notification rendering

function renderNotification(
  notification: Notification,
): RenderedActivity | null {
  if (notification.source !== "figma") return null;

  const meta = notification.metadata as Record<string, unknown> | undefined;
  const fileKey = meta?.fileKey as string | undefined;
  const author = meta?.author as string | undefined;

  let icon = "🎨"; // Default Figma icon
  let color: RenderedActivity["color"] = "info";

  if (notification.title.toLowerCase().includes("updated")) {
    icon = "🔄";
    color = "accent";
  } else if (
    notification.title.toLowerCase().includes("comment") ||
    notification.title.toLowerCase().includes("replied")
  ) {
    icon = (meta?.isReply as boolean | undefined) ? "↩️" : "💬";
  }

  const subtitleParts: string[] = [];
  if (fileKey) subtitleParts.push(fileKey);
  if (author) subtitleParts.push(`by ${author}`);

  return {
    icon,
    title: notification.title,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined,
    body: notification.body ?? undefined,
    style: "box",
    color,
  };
}

// Tool-call rendering

function renderTool(tool: string, args: unknown): RenderedActivity | null {
  if (!tool.startsWith("figma_")) return null;

  const toolArgs = (args ?? {}) as Record<string, unknown>;

  switch (tool) {
    case "figma_get_file":
      return {
        icon: "🎨",
        title: "Fetching Figma file",
        subtitle: toolArgs.depth ? `depth=${toolArgs.depth}` : undefined,
        style: "inline",
        color: "dim",
      };

    case "figma_get_comments":
      return {
        icon: "💬",
        title: "Reading Figma comments",
        subtitle: toolArgs.includeResolved ? "including resolved" : "open only",
        style: "inline",
        color: "dim",
      };

    case "figma_post_comment": {
      const message = (toolArgs.message as string | undefined) ?? "";
      return {
        icon: "✏️",
        title: toolArgs.replyToId
          ? "Replying on Figma"
          : "Posting Figma comment",
        subtitle: message.slice(0, 80) + (message.length > 80 ? "…" : ""),
        style: "box",
        color: "accent",
      };
    }

    default:
      return null;
  }
}
