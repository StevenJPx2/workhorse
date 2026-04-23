import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";

/**
 * A monitor that periodically polls for changes.
 * Created by a MonitorFactory when monitors are started for an issue.
 */
export interface Monitor {
  /** Unique name identifying this monitor type */
  name: string;
  /** Whether this monitors remote APIs or local resources */
  type: "remote" | "local";
  /** Polling interval in milliseconds */
  interval: number;
  /** Poll function - returns whether changes were detected */
  poll: () => Promise<MonitorResult>;
}

/**
 * Result returned by a monitor's poll function.
 */
export interface MonitorResult {
  /** Whether changes were detected since last poll */
  hasChanges: boolean;
  /** Optional data payload (e.g., new comments, review status) */
  data?: unknown;
}

/**
 * Factory function that creates a Monitor instance.
 * Plugins register factories, which are invoked when monitors start for an issue.
 */
export type MonitorFactory = (ctx: MonitorContext) => Monitor;

/**
 * Context passed to MonitorFactory when creating a monitor instance.
 */
export interface MonitorContext {
  /** The issue ID this monitor is watching */
  issueId: string;
  /** Event hooks for emitting events */
  hooks: Emitter<HookEventMap>;
  /** Memory service for accessing session memory and notifications */
  memory: MemoryService;
  /** Application configuration */
  config: Readonly<JiratownConfig>;
}

/**
 * Status of a running monitor, exposed via getRunningMonitors().
 */
export interface MonitorStatus {
  /** Monitor name */
  name: string;
  /** Monitor type */
  type: "remote" | "local";
  /** Issue ID being monitored */
  issueId: string;
  /** Current state */
  state: "running" | "stopped" | "error";
  /** When the last poll occurred */
  lastPoll?: Date;
  /** Result from the last poll */
  lastResult?: MonitorResult;
  /** Number of consecutive errors */
  errorCount: number;
}

/**
 * Internal representation of a running monitor instance.
 * Not exported from barrel - implementation detail.
 */
export interface RunningMonitor {
  /** The monitor instance */
  monitor: Monitor;
  /** Current status */
  status: MonitorStatus;
  /** Timeout ID for the next scheduled poll, null if stopped */
  timeoutId: ReturnType<typeof setTimeout> | null;
}
