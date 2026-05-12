/**
 * Shared types for GitHub tools.
 *
 * @module @jiratown/plugin-github/tools/types
 */

import type { HookEventMap } from "@jiratown/core";

/** Monitor service interface (subset we need) */
export interface MonitorServiceLike {
  startMonitor(id: string, issueId: string): void;
}

/** Hooks emitter interface (subset we need) */
export interface HooksEmitter {
  emit<K extends keyof HookEventMap>(event: K, payload: HookEventMap[K]): void;
}
