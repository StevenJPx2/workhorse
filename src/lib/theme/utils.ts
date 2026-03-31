/**
 * Theme utility functions for Jiratown TUI
 */

import { colors } from "./colors.ts";
import type { Theme } from "./types.ts";

/**
 * Get the color for a specific agent type
 * @param agent - The agent name
 * @param theme - Optional theme (defaults to base colors for backwards compatibility)
 */
export function getAgentColor(agent: string, theme?: Theme): string {
  const t = theme ?? colors;
  if (agent === "claude") {
    return t.agent.claude;
  }
  return t.agent.opencode;
}

/**
 * Format a key shortcut for display
 */
export function formatKeyHint(key: string, action: string): string {
  return `[${key}] ${action}`;
}

/**
 * Create a divider string of specified width
 */
export function createDivider(width: number, char = "─"): string {
  return char.repeat(width);
}
