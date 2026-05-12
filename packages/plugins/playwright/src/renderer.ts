/**
 * Playwright renderer for TUI display.
 *
 * Handles Playwright tool calls in the unified activity renderer system.
 *
 * @module workhorse-plugin-playwright/renderer
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
 * Playwright renderer for TUI display.
 * Handles Playwright tool calls; returns null for other inputs.
 */
export function playwrightRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;
  if (!input.tool.startsWith("playwright_")) return null;

  const toolName = input.tool.replace("playwright_", "");
  const args = input.args as Record<string, unknown> | undefined;

  // Tool-specific rendering
  switch (toolName) {
    case "navigate": {
      const url = args?.url as string | undefined;
      return {
        icon: "🌐",
        title: "Navigate",
        subtitle: url ? new URL(url).hostname : undefined,
        style: "inline",
        color: "info",
      };
    }

    case "screenshot": {
      return {
        icon: "📸",
        title: "Screenshot",
        subtitle: [
          args?.filename as string | undefined,
          (args?.fullPage as boolean | undefined) ? "full page" : undefined,
        ]
          .filter(Boolean)
          .join(" • "),
        style: "inline",
        color: "accent",
      };
    }

    case "click":
      return {
        icon: "👆",
        title: "Click",
        subtitle: args?.selector as string | undefined,
        style: "inline",
      };

    case "fill":
      return {
        icon: "⌨️",
        title: "Fill",
        subtitle: args?.selector as string | undefined,
        style: "inline",
      };

    case "get_element":
      return {
        icon: "🔍",
        title: "Get Element",
        subtitle: args?.selector as string | undefined,
        style: "inline",
        color: "dim",
      };

    case "get_page_content":
      return {
        icon: "📄",
        title: "Get Page Content",
        style: "inline",
        color: "dim",
      };

    case "evaluate": {
      const expression = args?.expression as string | undefined;
      return {
        icon: "⚡",
        title: "Evaluate JS",
        subtitle:
          expression && expression.length > 40 ? `${expression.slice(0, 40)}...` : expression,
        style: "inline",
      };
    }

    case "close_session":
      return {
        icon: "🚪",
        title: "Close Browser",
        style: "inline",
        color: "dim",
      };

    default:
      return {
        icon: "🎭",
        title: `Playwright: ${toolName}`,
        style: "inline",
      };
  }
}
