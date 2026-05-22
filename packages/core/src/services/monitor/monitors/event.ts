import type {
  EventCleanup,
  EventMonitorOptions,
  MonitorContext,
} from "../types.ts";
import { BaseMonitor } from "./base.ts";

/**
 * An event-driven monitor that sets up a listener once and emits results
 * as events occur.
 *
 * Use for WebSockets, webhooks, file watchers, or any push-based event source.
 * The monitor self-stops after 5 consecutive errors.
 *
 * @example
 * ```typescript
 * const monitor = new EventMonitor({
 *   id: "slack-events",
 *   type: "event",
 *   setup: async (ctx, emit) => {
 *     const socket = connectToSlack();
 *     socket.on("message", (msg) => {
 *       emit({ hasChanges: true, data: msg });
 *     });
 *     socket.on("error", (err) => {
 *       // Optionally report errors
 *     });
 *     return () => socket.close();
 *   },
 * });
 * await monitor.start(ctx);
 * ```
 */
export class EventMonitor extends BaseMonitor {
  readonly type = "event" as const;

  private readonly setup: EventMonitorOptions["setup"];
  private _cleanup: EventCleanup | null = null;

  constructor({ id, setup }: EventMonitorOptions) {
    super(id, "event");
    this.setup = setup;
  }

  /**
   * Start the event monitor for an issue.
   * Calls the setup function which should establish the event listener.
   */
  async start(ctx: MonitorContext): Promise<void> {
    if (!this.initStart(ctx)) return;

    try {
      this._cleanup = await this.setup(ctx, (result) =>
        this.handleResult(result),
      );
    } catch (error) {
      this.handleError(error as Error);
      // If setup fails immediately, stop the monitor
      if (this.status.state === "error") {
        await this.stop();
      }
    }
  }

  /**
   * Stop the event monitor. Calls the cleanup function from setup.
   * Safe to call multiple times.
   */
  async stop(): Promise<void> {
    if (this._cleanup) {
      try {
        await this._cleanup();
      } catch {
        // Ignore cleanup errors - we're stopping anyway
      }
      this._cleanup = null;
    }
    this.status.state = "stopped";
  }

  /**
   * Report an error from within the event listener.
   *
   * Plugins can call this from their error handlers to integrate with
   * the monitor's error tracking and auto-stop behavior.
   *
   * @example
   * ```typescript
   * setup: async (ctx, emit) => {
   *   const socket = connectToSlack();
   *   socket.on("error", (err) => {
   *     monitor.reportError(err);
   *   });
   *   // ...
   * }
   * ```
   */
  reportError(error: Error): void {
    this.handleError(error);

    // If we hit the error threshold, stop the monitor
    if (this.status.state === "error") {
      this.stop();
    }
  }
}
