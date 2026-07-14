/**
 * Shared types for TUI activity renderers.
 */
import type { Notification } from "#db";

/**
 * Activity input type for the unified renderer system.
 * Matches TUI's ActivityInput discriminated union.
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

/** Color type for consistency across renderers. */
export type ActivityColor =
  "info" | "success" | "warning" | "error" | "dim" | "accent";
