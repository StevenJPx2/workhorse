import type { Notification } from "workhorse-core";

/**
 * Discriminated union for activity inputs.
 * Plugins can handle notification and/or tool rendering based on kind.
 */
export type ActivityInput =
  | { kind: "notification"; notification: Notification }
  | { kind: "tool"; tool: string; args: unknown };
// Future extensions:
// | { kind: "event"; event: IssueEvent }
// | { kind: "message"; message: ChatMessage }

/**
 * Rendered activity output for display in the TUI.
 */
export interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  /** "box" for multi-line with border, "inline" for single line */
  style: "box" | "inline";
  /** Color hint for the activity */
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}

/**
 * An activity renderer transforms an activity input into displayable output.
 * Return null to indicate "I don't handle this input, try the next renderer."
 */
export type ActivityRenderer = (
  input: ActivityInput,
) => RenderedActivity | null;

/**
 * Payload for the tui.register_renderer hook.
 */
export interface RegisterRendererPayload {
  /** Unique renderer ID (e.g., "jira", "pi-tools", "workhorse") */
  id: string;
  /** The renderer function */
  renderer: ActivityRenderer;
  /** Higher priority = checked first (default: 0) */
  priority?: number;
}
