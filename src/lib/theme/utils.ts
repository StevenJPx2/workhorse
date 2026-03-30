/**
 * Theme utility functions for Jiratown TUI
 */

import { colors } from "./colors.ts";

/**
 * Get the color for a specific agent type
 */
export function getAgentColor(agent: string): string {
  if (agent === "claude") {
    return colors.agent.claude;
  }
  return colors.agent.opencode;
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
