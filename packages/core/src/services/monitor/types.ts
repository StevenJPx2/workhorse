import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";

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
 * Context passed to poll() on each invocation and to start().
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
 * Status of a monitor, exposed via getRunningMonitors().
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
 * Options for creating a Monitor instance.
 */
export interface MonitorOptions {
  /** Unique name identifying this monitor type */
  name: string;
  /** Whether this monitors remote APIs or local resources */
  type: "remote" | "local";
  /** Polling interval in milliseconds */
  interval: number;
  /** Poll function - receives full context on each call */
  poll: (ctx: MonitorContext) => Promise<MonitorResult>;
}
