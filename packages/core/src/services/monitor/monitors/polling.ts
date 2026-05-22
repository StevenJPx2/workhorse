import type {
  MonitorContext,
  MonitorResult,
  PollingMonitorOptions,
} from "../types.ts";
import { BaseMonitor } from "./base.ts";

/**
 * A polling-based monitor that calls poll() at a fixed interval.
 *
 * Use for external APIs without webhooks (Jira comments, GitHub PR status).
 * The monitor self-stops after 5 consecutive errors, or immediately if
 * the onError callback returns { stop: true }. Use { pauseMs } to temporarily
 * pause and auto-resume after a backoff period (useful for rate limits).
 *
 * @example
 * ```typescript
 * const monitor = new PollingMonitor({
 *   id: "jira-comments",
 *   type: "polling",
 *   interval: 30_000,
 *   poll: async (ctx) => {
 *     const comments = await fetchNewComments(ctx.issueId);
 *     return { hasChanges: comments.length > 0, data: comments };
 *   },
 *   onError: (error) => {
 *     if (error.message.includes("rate limit")) {
 *       // Pause for 60 seconds, then resume
 *       return { pauseMs: 60_000, reason: "Rate limited" };
 *     }
 *   },
 * });
 * monitor.start(ctx);
 * ```
 */
export class PollingMonitor extends BaseMonitor {
  readonly type = "polling" as const;

  private readonly interval: number;
  private readonly poll: (ctx: MonitorContext) => Promise<MonitorResult>;
  private readonly onError: NonNullable<PollingMonitorOptions["onError"]>;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor({ id, interval, poll, onError }: PollingMonitorOptions) {
    super(id, "polling");
    this.interval = interval;
    this.poll = poll;
    this.onError = onError ?? (() => undefined);
  }

  /**
   * Start the poll loop for an issue.
   * Stores the context and schedules the first poll.
   */
  start(ctx: MonitorContext): void {
    if (!this.initStart(ctx)) return;
    this._schedulePoll();
  }

  /**
   * Stop the poll loop. Safe to call multiple times.
   */
  stop(): void {
    if (this._timeoutId !== null) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
    this.status.state = "stopped";
  }

  /**
   * Schedule the next poll after the configured interval.
   */
  private _schedulePoll(): void {
    if (this.status.state !== "running" || !this._ctx) return;

    this._timeoutId = setTimeout(async () => {
      if (this.status.state !== "running" || !this._ctx) return;

      try {
        this.handleResult(await this.poll(this._ctx));
      } catch (error) {
        await this._handlePollError(error as Error);
      }

      // Schedule next poll unless stopped by error threshold or onError
      if (this.status.state === "running") {
        this._schedulePoll();
      } else {
        this._timeoutId = null;
      }
    }, this.interval);
  }

  /**
   * Handle a poll error, checking onError callback first.
   * If onError returns { stop: true }, stops immediately.
   * If onError returns { pauseMs }, pauses and resumes after the delay.
   * Otherwise, delegates to base handleError for threshold tracking.
   */
  private async _handlePollError(error: Error): Promise<void> {
    if (!this._ctx) return;

    // Check if onError callback wants to stop or pause
    const result = await this.onError(error, this._ctx);

    if (result?.stop) {
      this.status.state = "error";
      this._ctx.hooks.emit("monitor.error", {
        id: this.id,
        issueId: this._ctx.issueId,
        error,
        errorCount: this.status.errorCount + 1,
        reason: result.reason,
      });
      return;
    }

    if (result?.pauseMs !== undefined) {
      const ms =
        typeof result.pauseMs === "function"
          ? result.pauseMs({ error, errorCount: this.status.errorCount + 1 })
          : result.pauseMs;

      if (ms && ms > 0) {
        this._pause(ms, result.reason);
        return;
      }
    }

    // Default behavior: track errors and stop after threshold
    this.handleError(error);
  }

  /**
   * Pause the monitor for the specified duration, then resume.
   */
  private _pause(ms: number, reason?: string): void {
    if (!this._ctx) return;

    this.status.state = "paused";
    this.status.resumesAt = new Date(Date.now() + ms);

    this._ctx.hooks.emit("monitor.paused", {
      id: this.id,
      issueId: this._ctx.issueId,
      pauseMs: ms,
      resumesAt: this.status.resumesAt,
      reason,
    });

    this._timeoutId = setTimeout(() => {
      if (this.status.state !== "paused" || !this._ctx) return;

      this.status.state = "running";
      this.status.resumesAt = undefined;

      this._ctx.hooks.emit("monitor.resumed", {
        id: this.id,
        issueId: this._ctx.issueId,
      });

      this._schedulePoll();
    }, ms);
  }
}
