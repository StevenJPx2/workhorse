/**
 * Shared constants and utilities for PR review hook
 */

export const DEFAULT_POLL_INTERVAL = 30000;
export const MAX_REPLY_LENGTH = 65535;

export function resolveValue<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}
