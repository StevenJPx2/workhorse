import { Monitor } from "./monitor.ts";
import type { MonitorContext, MonitorStatus } from "./types.ts";

/**
 * Polling framework for Jiratown. Core provides infrastructure, plugins bring the "what" to monitor.
 * Callers construct Monitor instances and start them per-issue via startMonitor(). See README.md for examples.
 */
export class MonitorService {
  private running = new Map<string, Monitor>();

  /**
   * Start a monitor for an issue.
   * If a monitor with the same name is already running for this issue, this is a no-op.
   *
   * @param issueId - Issue to monitor
   * @param ctx - Context passed to the monitor's poll function
   * @param monitor - Monitor instance to start
   */
  startMonitor(issueId: string, ctx: MonitorContext, monitor: Monitor): void {
    const key = this.makeKey(issueId, monitor.name);
    if (this.running.has(key)) return;

    ctx.hooks.emit("monitor.registered", { name: monitor.name, type: monitor.type });

    monitor.start(ctx);
    this.running.set(key, monitor);
  }

  /**
   * Stop a specific monitor for an issue.
   *
   * @param issueId - Issue ID
   * @param name - Monitor name
   */
  stopMonitor(issueId: string, name: string): void {
    const key = this.makeKey(issueId, name);
    const monitor = this.running.get(key);
    if (monitor) {
      monitor.stop();
      this.running.delete(key);
    }
  }

  /**
   * Stop all monitors for an issue.
   *
   * @param issueId - Issue to stop monitoring
   */
  stopMonitors(issueId: string): void {
    for (const [key, monitor] of this.running) {
      if (monitor.status.issueId === issueId) {
        monitor.stop();
        this.running.delete(key);
      }
    }
  }

  /**
   * Get status of all running monitors for an issue.
   * Auto-purges monitors that have self-stopped due to error threshold.
   *
   * @param issueId - Issue to query
   * @returns Array of monitor statuses
   */
  getRunningMonitors(issueId: string): MonitorStatus[] {
    const statuses: MonitorStatus[] = [];

    for (const [key, monitor] of this.running) {
      const status = monitor.status;
      if (status.issueId !== issueId) continue;

      if (status.state !== "running") {
        this.running.delete(key);
      } else {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Shutdown all monitors. Called during application shutdown.
   */
  shutdown(): void {
    for (const monitor of this.running.values()) {
      monitor.stop();
    }
    this.running.clear();
  }

  private makeKey(issueId: string, name: string): string {
    return `${issueId}:${name}`;
  }
}
