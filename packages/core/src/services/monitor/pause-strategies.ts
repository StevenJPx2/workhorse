/**
 * Pause duration strategies for rate limit handling.
 *
 * @module workhorse-core/services/monitor/pause-strategies
 */
import type { PauseContext, PauseDurationFn } from "./types.ts";

const DEFAULT_PAUSE_MS = 60_000;
const MAX_PAUSE_MS = 600_000;

/** Parse Retry-After from response headers (seconds or timestamp). */
export function parseRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get("Retry-After");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }

  const reset = headers.get("x-ratelimit-reset");
  if (reset) {
    const timestamp = parseInt(reset, 10);
    if (!isNaN(timestamp)) {
      const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
      if (ms > Date.now()) return ms - Date.now();
    }
  }

  return undefined;
}

/** Create a rate limit error checker with custom patterns. */
export function createRateLimitChecker(
  patterns: string[],
): (error: unknown) => boolean {
  const lowerPatterns = patterns.map((p) => p.toLowerCase());
  return (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return lowerPatterns.some((p) => message.includes(p));
  };
}

/** Extract retryAfterMs property from error (attached by API clients). */
export function extractRetryAfter(error: Error): number | undefined {
  const retryAfterMs = (error as Error & { retryAfterMs?: number })
    .retryAfterMs;
  if (typeof retryAfterMs === "number" && retryAfterMs > 0) {
    return Math.min(retryAfterMs, MAX_PAUSE_MS);
  }
  return undefined;
}

/** Calculate exponential backoff with jitter (0.7–1.3x). */
export function exponentialBackoff(
  errorCount: number,
  baseMs = 5000,
  maxMs = MAX_PAUSE_MS,
): number {
  return Math.round(
    Math.min(2 ** (errorCount - 1) * baseMs, maxMs) *
      (0.7 + Math.random() * 0.6),
  );
}

/** Try Retry-After first, fall back to exponential backoff. */
export function withRetryAfterOrBackoff(
  defaultMs = DEFAULT_PAUSE_MS,
): PauseDurationFn {
  return ({ error, errorCount }: PauseContext): number => {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) return retryAfter;
    if (errorCount > 1) return exponentialBackoff(errorCount);
    return defaultMs;
  };
}

/** Fixed-duration pause function. */
export function fixedPause(ms: number): PauseDurationFn {
  return () => ms;
}
