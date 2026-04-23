import type { MonitorContext, MonitorOptions, MonitorResult, MonitorStatus } from "./types.ts";

/** Number of consecutive errors before a monitor stops itself */
const ERROR_THRESHOLD = 5;

/**
 * A self-managing monitor that owns its poll loop, scheduling, error counting,
 * and status. Construct with options and start per-issue via start(ctx).
 */
export class Monitor {
  readonly name: string;
  readonly type: "remote" | "local";
  readonly interval: number;
  readonly poll: (ctx: MonitorContext) => Promise<MonitorResult>;

  readonly status: MonitorStatus;
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _ctx: MonitorContext | null = null;

  constructor({ name, type, interval, poll }: MonitorOptions) {
    this.name = name;
    this.type = type;
    this.interval = interval;
    this.poll = poll;

    this.status = {
      name,
      type,
      issueId: "",
      state: "stopped",
      lastPoll: undefined,
      lastResult: undefined,
      errorCount: 0,
    };
  }

  /**
   * Start the poll loop for an issue.
   * Stores the context (for hooks + issueId) and schedules the first poll.
   */
  start(ctx: MonitorContext): void {
    if (this.status.state === "running") return;
    this._ctx = ctx;
    this.status.issueId = ctx.issueId;
    this.status.state = "running";
    this._poll();
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

  private _poll(): void {
    if (this.status.state !== "running" || this._ctx === null) return;

    const ctx = this._ctx;

    this._timeoutId = setTimeout(async () => {
      if (this.status.state !== "running") return;

      try {
        const result = await this.poll(ctx);

        this.status.lastPoll = new Date();
        this.status.lastResult = result;
        this.status.errorCount = 0;

        if (result.hasChanges) {
          ctx.hooks.emit("monitor.tick", {
            name: this.name,
            issueId: ctx.issueId,
            result: result.data,
          });
        }
      } catch (error) {
        this.status.errorCount++;
        this.status.lastPoll = new Date();

        ctx.hooks.emit("monitor.error", {
          name: this.name,
          issueId: ctx.issueId,
          error: error as Error,
          errorCount: this.status.errorCount,
        });

        if (this.status.errorCount >= ERROR_THRESHOLD) {
          this.status.state = "error";
          this._timeoutId = null;
          return;
        }
      }

      this._poll();
    }, this.interval);
  }
}
