import type { WorkhorseConfig } from "#config";
import type { HookEmitter } from "#lib";
import type { MemoryService } from "#services";

import type { BaseMonitor } from "./base-monitor.ts";
import { EventMonitor } from "./event-monitor.ts";
import { PollingMonitor } from "./polling-monitor.ts";
import type { MonitorOptions, MonitorStatus } from "./types.ts";

/**
 * Polling and event framework for Workhorse.
 * Core provides infrastructure, plugins bring the "what" to monitor.
 *
 * Two-phase API:
 * 1. registerMonitor(options) - Plugin registers a monitor definition (once at startup)
 * 2. startMonitor(id, issueId) - Start a registered monitor for a specific issue (e.g., from a hook)
 *
 * Supports two monitor types:
 * - "polling" - Calls poll() at a fixed interval (for APIs without webhooks)
 * - "event" - Sets up a listener once, emits results as events occur (for WebSockets, webhooks)
 *
 * See README.md for examples.
 */
export class MonitorService {
  /** Registered monitor definitions (templates) */
  private registered = new Map<string, MonitorOptions>();
  /** Running monitor instances, keyed by issueId:monitorId */
  private running = new Map<string, BaseMonitor>();

  constructor(
    private readonly hooks: HookEmitter,
    private readonly memory: MemoryService,
    private readonly config: Readonly<WorkhorseConfig>,
  ) {}

  /**
   * Register a monitor definition. Call once at plugin initialization.
   * Does not start monitoring - use startMonitor() to begin monitoring an issue.
   *
   * @param options - Monitor configuration (polling or event)
   * @throws If a monitor with the same id is already registered
   */
  registerMonitor(options: MonitorOptions): void {
    if (this.registered.has(options.id)) {
      throw new Error(`Monitor "${options.id}" is already registered`);
    }
    this.registered.set(options.id, options);
    this.hooks.emit("monitor.registered", {
      name: options.id,
      type: options.type,
    });
  }

  /**
   * Start a registered monitor for an issue.
   * If already running for this issue, this is a no-op.
   *
   * @param id - Monitor id (from registerMonitor)
   * @param issueId - Issue to monitor
   * @throws If monitor id is not registered
   */
  async startMonitor(id: string, issueId: string): Promise<void> {
    const options = this.registered.get(id);
    if (!options) {
      throw new Error(`Monitor "${id}" is not registered. Call registerMonitor() first.`);
    }

    const key = this.makeKey(issueId, id);
    if (this.running.has(key)) return;

    const monitor =
      options.type === "event" ? new EventMonitor(options) : new PollingMonitor(options);

    await monitor.start({
      issueId,
      hooks: this.hooks,
      memory: this.memory,
      config: this.config,
    });
    this.running.set(key, monitor);
  }

  /**
   * Stop a specific monitor for an issue.
   *
   * @param issueId - Issue ID
   * @param id - Monitor id
   */
  async stopMonitor(issueId: string, id: string): Promise<void> {
    const key = this.makeKey(issueId, id);
    const monitor = this.running.get(key);
    if (monitor) {
      await monitor.stop();
      this.running.delete(key);
    }
  }

  /**
   * Stop all monitors for an issue.
   *
   * @param issueId - Issue to stop monitoring
   */
  async stopMonitors(issueId: string): Promise<void> {
    const stops: Promise<void>[] = [];
    const keysToDelete: string[] = [];

    for (const [key, monitor] of this.running) {
      if (monitor.status.issueId === issueId) {
        stops.push(Promise.resolve(monitor.stop()));
        keysToDelete.push(key);
      }
    }

    await Promise.all(stops);

    for (const key of keysToDelete) {
      this.running.delete(key);
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
  async shutdown(): Promise<void> {
    await Promise.all([...this.running.values()].map((m) => Promise.resolve(m.stop())));
    this.running.clear();
  }

  private makeKey(issueId: string, id: string): string {
    return `${issueId}:${id}`;
  }
}
