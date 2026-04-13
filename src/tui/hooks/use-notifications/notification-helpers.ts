/**
 * TUI-specific notification helpers
 *
 * Note: Pure list manipulation functions have been moved to core/notifications/notification-helpers.ts
 */

import type { UseNotificationsOptions } from "./types.ts";

/**
 * Resolve ticket ID from options (handles both static and getter forms)
 */
export function resolveTicketId(options: UseNotificationsOptions): string | undefined {
  const tid = options.ticketId;
  return typeof tid === "function" ? tid() : tid;
}

/**
 * Handle notification error with signal setter and optional callback
 */
export function handleNotificationError(
  err: unknown,
  setError: (e: Error | null) => void,
  onError?: (error: Error) => void,
): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  setError(e);
  onError?.(e);
  return e;
}
