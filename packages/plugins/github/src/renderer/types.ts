/**
 * Shared types for GitHub TUI renderers.
 *
 * @module workhorse-plugin-github/renderer/types
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
