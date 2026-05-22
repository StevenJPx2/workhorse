import type { MonitorContext, MonitorResult, MonitorStatus } from "../types.ts";

/** Number of consecutive errors before a monitor stops itself */
export const ERROR_THRESHOLD = 5;

/**
 * Abstract base class for all monitors.
 * Handles common state management, error tracking, and hook emission.
 *
 * Subclasses must implement:
 * - `type`: The monitor type ("polling" or "event")
 * - `start(ctx)`: Start the monitor for an issue
 * - `stop()`: Stop the monitor
 */
export abstract class BaseMonitor {
  /** The monitor type - must be set by subclasses */
  abstract readonly type: "polling" | "event";

  /** Unique identifier for this monitor */
  readonly id: string;

  /** Monitor context, set when started */
  protected _ctx: MonitorContext | null = null;

  /** Monitor status - exposed as readonly, mutated internally */
  readonly status: MonitorStatus;

  constructor(id: string, type: "polling" | "event") {
    this.id = id;
    this.status = {
      id,
      type,
      issueId: "",
      state: "stopped",
      lastActivity: undefined,
      lastResult: undefined,
      errorCount: 0,
    };
  }

  /**
   * Start the monitor for an issue.
   * Implementations should call `initStart()` first and return early if it returns false.
   */
  abstract start(ctx: MonitorContext): Promise<void> | void;

  /**
   * Stop the monitor.
   * Implementations should clean up resources and set state to stopped.
   */
  abstract stop(): Promise<void> | void;

  /**
   * Initialize common state when starting.
   * Returns false if the monitor is already running (caller should return early).
   *
   * @param ctx - Monitor context
   * @returns true if initialization succeeded, false if already running
   */
  protected initStart(ctx: MonitorContext): boolean {
    if (this.status.state === "running") return false;

    this._ctx = ctx;
    this.status.issueId = ctx.issueId;
    this.status.state = "running";
    return true;
  }

  /**
   * Called when a result is received (from poll or event).
   * Resets error count and emits monitor.tick if hasChanges is true.
   *
   * @param result - The monitor result
   */
  protected handleResult(result: MonitorResult): void {
    if (this.status.state !== "running" || !this._ctx) return;

    this.status.lastActivity = new Date();
    this.status.lastResult = result;
    this.status.errorCount = 0;

    if (result.hasChanges) {
      this._ctx.hooks.emit("monitor.tick", {
        id: this.id,
        issueId: this._ctx.issueId,
        result: result.data,
      });
    }
  }

  /**
   * Called when an error occurs.
   * Increments error count, emits monitor.error, and self-stops after threshold.
   *
   * @param error - The error that occurred
   */
  protected handleError(error: Error): void {
    if (!this._ctx) return;

    this.status.errorCount++;
    this.status.lastActivity = new Date();

    this._ctx.hooks.emit("monitor.error", {
      id: this.id,
      issueId: this._ctx.issueId,
      error,
      errorCount: this.status.errorCount,
    });

    if (this.status.errorCount >= ERROR_THRESHOLD) {
      this.status.state = "error";
      // Note: subclasses should check state after handleError and stop if needed
    }
  }
}
