/**
 * GitHub renderer for TUI display.
 *
 * Handles GitHub notifications and tool calls in the unified activity
 * renderer system.
 *
 * @module workhorse-plugin-github/renderer
 */

import { renderGithubNotification } from "./notification.ts";
import { renderGithubTool } from "./tool.ts";
import type { ActivityInput, RenderedActivity } from "./types.ts";

export type { ActivityInput, RenderedActivity };

/**
 * GitHub renderer for TUI display.
 * Handles GitHub notifications and tool calls; returns null for other inputs.
 */
export function githubRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind === "notification") {
    return renderGithubNotification(input.notification);
  }

  if (input.kind === "tool") {
    return renderGithubTool(input.tool, input.args);
  }

  return null;
}
