/**
 * Tool renderers for TUI display.
 *
 * Handles rendering of core Workhorse tools:
 * - update_status, escalate, acknowledge
 * - memory_search, memory_write
 * - load_skill
 */

import type { ActivityColor, ActivityInput, RenderedActivity } from "./types.ts";

/** Skill loading renderer for TUI display. */
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

/** Workhorse tool renderer for TUI display. */
export function workhorseToolRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;
  if (!input.tool.startsWith("workhorse_")) return null;

  const args = (input.args ?? {}) as Record<string, unknown>;

  if (input.tool === "workhorse_update_status") {
    const status = String(args.status ?? "?");
    return {
      icon: "⚡",
      title: `status → ${status}`,
      style: "inline",
      color:
        (
          {
            done: "success",
            blocked: "error",
            in_review: "warning",
            implementing: "info",
            planning: "info",
          } as Record<string, ActivityColor>
        )[status] ?? "dim",
    };
  }

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

  if (input.tool === "workhorse_acknowledge") {
    return { icon: "✓", title: "acknowledged notifications", style: "inline", color: "success" };
  }

  if (input.tool === "workhorse_memory_search") {
    const query = String(args.query ?? "").slice(0, 40);
    return {
      icon: "🔍",
      title: `memory search: "${query}${query.length >= 40 ? "…" : ""}"`,
      style: "inline",
      color: "dim",
    };
  }

  if (input.tool === "workhorse_memory_write") {
    const parts: string[] = [];
    if (Array.isArray(args.summary) && args.summary.length > 0) parts.push("summary");
    if (Array.isArray(args.learnings) && args.learnings.length > 0) parts.push("learnings");
    if (Array.isArray(args.patterns) && args.patterns.length > 0) parts.push("patterns");
    return {
      icon: "💾",
      title: `saved to memory: ${parts.join(", ") || "checkpoint"}`,
      style: "inline",
      color: "success",
    };
  }

  if (input.tool === "workhorse_preview_image") {
    return {
      icon: "🖼️",
      title: "viewing image",
      subtitle: shortenPath(String(args.path ?? "")),
      style: "inline",
      color: "info",
    };
  }

  return null;
}

/** Shorten file path for display */
function shortenPath(path: string): string {
  if (!path) return "?";
  if (path.length <= 35) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path.slice(-35);
  return `…/${parts.slice(-2).join("/")}`;
}
