import type { Notification } from "@jiratown/core";

/**
 * Rendered notification output for display in the TUI.
 */
export interface RenderedNotification {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  /** "box" for multi-line with border, "inline" for single line */
  style: "box" | "inline";
}

/**
 * A notification renderer transforms a notification into displayable output.
 */
export type NotificationRenderer = (notification: Notification) => RenderedNotification;

/**
 * Payload for the tui.register_renderer hook.
 */
export interface RegisterRendererPayload {
  type: string;
  renderer: NotificationRenderer;
}
