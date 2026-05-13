/**
 * Workhorse tool renderers for TUI display.
 *
 * Handles rendering of core Workhorse tools: update_status, escalate, acknowledge.
 */

/**
 * Activity input type for the unified renderer system.
 * Matches TUI's ActivityInput discriminated union.
 */
type ActivityInput =
  | { kind: "notification"; notification: unknown }
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
      body: truncate(String(args.message ?? ""), 60),
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

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 3) + "...";
}
