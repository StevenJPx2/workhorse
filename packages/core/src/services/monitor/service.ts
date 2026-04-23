import type { Emitter } from "mitt";
import type { HookEventMap } from "#lib/hooks";
import type { MonitorContext, MonitorFactory, MonitorStatus, RunningMonitor } from "./types.ts";

/** Number of consecutive errors before a monitor is stopped */
const ERROR_THRESHOLD = 5;

/**
 * Polling framework for Jiratown. Core provides infrastructure, plugins bring the "what" to monitor.
 * Register factories via `registerMonitor()`, start/stop per issue. See README.md for examples.
 */
export class MonitorService {
  private factories = new Map<string, MonitorFactory>();
  private running = new Map<string, RunningMonitor>();

  constructor(private hooks: Emitter<HookEventMap>) {}

  /**
   * Register a monitor factory.
   * Factories are invoked when startMonitors() is called for an issue.
   *
   * @param name - Unique monitor name
   * @param factory - Function that creates a Monitor instance
   * @throws Error if a monitor with this name is already registered
   */
  registerMonitor(name: string, factory: MonitorFactory): void {
    if (this.factories.has(name)) {
      throw new Error(`Monitor "${name}" is already registered`);
    }
    this.factories.set(name, factory);
  }

  /**
   * Start all registered monitors for an issue.
   * Creates monitor instances from factories and begins polling.
   *
   * @param issueId - Issue to monitor
   * @param ctx - Context passed to monitor factories
   */
  startMonitors(issueId: string, ctx: MonitorContext): void {
    for (const [name, factory] of this.factories) {
      const key = this.makeKey(issueId, name);

      if (this.running.has(key)) continue;

      const monitor = factory(ctx);

      this.hooks.emit("monitor.registered", { name, type: monitor.type });

      const running: RunningMonitor = {
        monitor,
        status: {
          name,
          type: monitor.type,
          issueId,
          state: "running",
          errorCount: 0,
        },
        timeoutId: null,
      };

      this.running.set(key, running);
      this.schedulePoll(key, running);
    }
  }

  /**
   * Stop all monitors for an issue.
   *
   * @param issueId - Issue to stop monitoring
   */
  stopMonitors(issueId: string): void {
    for (const [key, running] of this.running) {
      if (running.status.issueId === issueId) {
        this.stopRunningMonitor(key, running);
      }
    }
  }

  /**
   * Stop a specific monitor for an issue.
   *
   * @param issueId - Issue ID
   * @param name - Monitor name
   */
  stopMonitor(issueId: string, name: string): void {
    const key = this.makeKey(issueId, name);
    const running = this.running.get(key);
    if (running) {
      this.stopRunningMonitor(key, running);
    }
  }

  /**
   * Get status of all running monitors for an issue.
   *
   * @param issueId - Issue to query
   * @returns Array of monitor statuses
   */
  getRunningMonitors(issueId: string): MonitorStatus[] {
    const statuses: MonitorStatus[] = [];
    for (const running of this.running.values()) {
      if (running.status.issueId === issueId) {
        statuses.push({ ...running.status });
      }
    }
    return statuses;
  }

  /**
   * Shutdown all monitors. Called during application shutdown.
   */
  shutdown(): void {
    for (const [key, running] of this.running) {
      this.stopRunningMonitor(key, running);
    }
  }

  private makeKey(issueId: string, name: string): string {
    return `${issueId}:${name}`;
  }

  private stopRunningMonitor(key: string, running: RunningMonitor): void {
    if (running.timeoutId !== null) {
      clearTimeout(running.timeoutId);
      running.timeoutId = null;
    }
    running.status.state = "stopped";
    this.running.delete(key);
  }

  private schedulePoll(key: string, running: RunningMonitor): void {
    if (running.status.state !== "running") return;

    running.timeoutId = setTimeout(() => {
      void this.executePoll(key, running);
    }, running.monitor.interval);
  }

  private async executePoll(key: string, running: RunningMonitor): Promise<void> {
    if (running.status.state !== "running") return;

    const { monitor, status } = running;

    try {
      const result = await monitor.poll();

      status.lastPoll = new Date();
      status.lastResult = result;
      status.errorCount = 0;

      if (result.hasChanges) {
        this.hooks.emit("monitor.tick", {
          name: monitor.name,
          issueId: status.issueId,
          result: result.data,
        });
      }
    } catch (error) {
      status.errorCount++;
      status.lastPoll = new Date();

      this.hooks.emit("monitor.error", {
        name: monitor.name,
        issueId: status.issueId,
        error: error as Error,
        errorCount: status.errorCount,
      });

      if (status.errorCount >= ERROR_THRESHOLD) {
        status.state = "error";
        this.stopRunningMonitor(key, running);
        return;
      }
    }

    this.schedulePoll(key, running);
  }
}
