import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";

/**
 * Result returned by a monitor's poll function or event emission.
 */
export interface MonitorResult {
  /** Whether changes were detected since last poll/event */
  hasChanges: boolean;
  /** Optional data payload (e.g., new comments, review status) */
  data?: unknown;
}

/**
 * Context passed to monitors on start and each poll/event.
 */
export interface MonitorContext {
  /** The issue ID this monitor is watching */
  issueId: string;
  /** Event hooks for emitting events */
  hooks: HookEmitter;
  /** Memory service for accessing session memory and notifications */
  memory: MemoryService;
  /** Application configuration */
  config: Readonly<WorkhorseConfig>;
}

/**
 * Status of a monitor, exposed via getRunningMonitors().
 */
export interface MonitorStatus {
  /** Monitor identifier */
  id: string;
  /** Monitor type */
  type: "polling" | "event";
  /** Issue ID being monitored */
  issueId: string;
  /** Current state */
  state: "running" | "stopped" | "error" | "paused";
  /** When the last activity occurred (poll or event) */
  lastActivity?: Date;
  /** Result from the last poll/event */
  lastResult?: MonitorResult;
  /** Number of consecutive errors */
  errorCount: number;
  /** When the monitor will resume (if paused) */
  resumesAt?: Date;
}

// Event Monitor Types

/**
 * Callback for event monitors to emit results.
 * Call this whenever an event occurs that should notify the system.
 */
export type EventEmitter = (result: MonitorResult) => void;

/**
 * Cleanup function returned by event monitor setup.
 * Called when the monitor is stopped.
 */
export type EventCleanup = () => Promise<void> | void;

// Monitor Options

/**
 * Base options shared by all monitor types.
 */
interface MonitorOptionsBase {
  /** Unique identifier for this monitor */
  id: string;
}

/**
 * Context passed to pause duration calculator functions.
 */
export interface PauseContext {
  /** The error that triggered the pause */
  error: Error;
  /** Number of consecutive errors (including this one) */
  errorCount: number;
}

/**
 * Function that calculates how long to pause before resuming.
 * Return milliseconds to pause, or 0/undefined to use default error handling.
 */
export type PauseDurationFn = (ctx: PauseContext) => number | undefined;

/**
 * Result from onError callback indicating how to handle the error.
 */
export interface ErrorHandlingResult {
  /** If true, stop the monitor immediately (don't wait for error threshold) */
  stop?: boolean;
  /**
   * Pause duration in milliseconds, or a function that calculates it.
   * Use a function to extract Retry-After headers or implement backoff.
   */
  pauseMs?: number | PauseDurationFn;
  /** Optional message explaining why the monitor was stopped/paused */
  reason?: string;
}

/**
 * Options for polling-based monitors.
 *
 * Polling monitors call poll() at a fixed interval to check for changes.
 * Use for external APIs without webhooks (Jira comments, GitHub PR status).
 */
export interface PollingMonitorOptions extends MonitorOptionsBase {
  /** Monitor type */
  type: "polling";
  /** Polling interval in milliseconds */
  interval: number;
  /** Poll function - receives full context on each call */
  poll: (ctx: MonitorContext) => Promise<MonitorResult>;
  /**
   * Optional error handler. Return { stop: true } to stop the monitor immediately.
   * Use this for rate limits, auth failures, or other unrecoverable errors.
   *
   * @param error - The error that occurred
   * @param ctx - Monitor context
   * @returns Error handling result, or void to use default behavior
   */
  onError?: (
    error: Error,
    ctx: MonitorContext,
  ) => ErrorHandlingResult | void | Promise<ErrorHandlingResult | void>;
}

/**
 * Options for event-driven monitors.
 *
 * Event monitors set up a listener once and emit results as events occur.
 * Use for WebSockets, webhooks, file watchers, etc.
 *
 * @example
 * ```typescript
 * ctx.monitors.registerMonitor({
 *   id: "slack-events",
 *   type: "event",
 *   setup: async (ctx, emit) => {
 *     const socket = connectToSlack();
 *     socket.on("message", (msg) => {
 *       emit({ hasChanges: true, data: msg });
 *     });
 *     return () => socket.close();
 *   },
 * });
 * ```
 */
export interface EventMonitorOptions extends MonitorOptionsBase {
  /** Monitor type */
  type: "event";
  /**
   * Called once when the monitor starts.
   * Set up your event listener and call `emit()` when events occur.
   * Return a cleanup function that will be called on stop.
   *
   * @param ctx - Monitor context (issueId, hooks, memory, config)
   * @param emit - Call this to emit a MonitorResult when an event occurs
   * @returns Cleanup function (or Promise of one)
   */
  setup: (
    ctx: MonitorContext,
    emit: EventEmitter,
  ) => Promise<EventCleanup> | EventCleanup;
}

/**
 * Union type for all monitor options.
 */
export type MonitorOptions = PollingMonitorOptions | EventMonitorOptions;
