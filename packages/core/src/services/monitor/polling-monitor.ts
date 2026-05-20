import { BaseMonitor } from "./base-monitor.ts";
import type { MonitorContext, MonitorResult, PollingMonitorOptions } from "./types.ts";

/**
 * A polling-based monitor that calls poll() at a fixed interval.
 *
 * Use for external APIs without webhooks (Jira comments, GitHub PR status).
 * The monitor self-stops after 5 consecutive errors.
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
 * });
 * monitor.start(ctx);
 * ```
 */
export class PollingMonitor extends BaseMonitor {
  readonly type = "polling" as const;

  private readonly interval: number;
  private readonly poll: (ctx: MonitorContext) => Promise<MonitorResult>;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor({ id, interval, poll }: PollingMonitorOptions) {
    super(id, "polling");
    this.interval = interval;
    this.poll = poll;
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
        this.handleError(error as Error);
      }

      // Schedule next poll unless stopped by error threshold
      if (this.status.state === "running") {
        this._schedulePoll();
      } else {
        this._timeoutId = null;
      }
    }, this.interval);
  }
}

// Re-export as Monitor for backward compatibility during migration
// TODO: Remove this alias once all consumers are updated
export { PollingMonitor as Monitor };
