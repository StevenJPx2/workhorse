import type { Notification } from "@jiratown/core";
import type {
  NotificationRenderer,
  RegisterRendererPayload,
  RenderedNotification,
} from "./types.ts";
import { defaultRenderer } from "./default.ts";

export type { NotificationRenderer, RegisterRendererPayload, RenderedNotification };

/**
 * Registry of notification renderers keyed by notification type.
 */
const renderers = new Map<string, NotificationRenderer>();

/**
 * Register a renderer for a specific notification type.
 * Called by plugins via the tui.register_renderer hook.
 */
export function registerRenderer(type: string, renderer: NotificationRenderer): void {
  renderers.set(type, renderer);
}

/**
 * Render a notification using the appropriate renderer.
 * Falls back to defaultRenderer if no specific renderer is registered.
 */
export function renderNotification(notification: Notification): RenderedNotification {
  const renderer = renderers.get(notification.source) ?? defaultRenderer;
  return renderer(notification);
}

/**
 * Get all registered renderer types.
 */
export function getRegisteredTypes(): string[] {
  return Array.from(renderers.keys());
}

/**
 * Clear all registered renderers (useful for testing).
 */
export function clearRenderers(): void {
  renderers.clear();
}
