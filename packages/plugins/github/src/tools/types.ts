/**
 * Shared types for GitHub tools.
 *
 * @module workhorse-plugin-github/tools/types
 */

import type { HookEmitter } from "workhorse-core";

/** Monitor service interface (subset we need) */
export interface MonitorServiceLike {
  startMonitor(id: string, issueId: string): void;
}

/** Hooks emitter interface - re-export from core for backwards compatibility */
export type HooksEmitter = HookEmitter;
