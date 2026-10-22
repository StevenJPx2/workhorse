import { REDIAL_BACKOFF_MS } from "@workhorse/protocol";

/** How long to wait before redial number `attempt` (from 0): the backoff steps, then the last one. */
export function redialDelay(attempt: number): number {
  return REDIAL_BACKOFF_MS[Math.min(attempt, REDIAL_BACKOFF_MS.length - 1)] ?? 0;
}
