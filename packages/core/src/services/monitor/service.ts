import type { Emitter } from "mitt";
import type { JiratownConfig } from "#config";
import type { HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { Monitor } from "./monitor.ts";
import type { MonitorOptions, MonitorStatus } from "./types.ts";

/**
 * Polling framework for Jiratown. Core provides infrastructure, plugins bring the "what" to monitor.
 *
 * Two-phase API:
 * 1. registerMonitor(options) - Plugin registers a monitor definition (once at startup)
 * 2. startMonitor(id, issueId) - Start a registered monitor for a specific issue (e.g., from a hook)
 *
 * See README.md for examples.
 */
export class MonitorService {
  /** Registered monitor definitions (templates) */
  private registered = new Map<string, MonitorOptions>();
  /** Running monitor instances, keyed by issueId:monitorId */
  private running = new Map<string, Monitor>();

  constructor(
    private readonly hooks: Emitter<HookEventMap>,
    private readonly memory: MemoryService,
    private readonly config: Readonly<JiratownConfig>,
  ) {}

  /**
   * Register a monitor definition. Call once at plugin initialization.
   * Does not start polling - use startMonitor() to begin monitoring an issue.
   *
   * @param options - Monitor configuration including unique id, type, interval, and poll function
   * @throws If a monitor with the same id is already registered
   */
  registerMonitor(options: MonitorOptions): void {
    if (this.registered.has(options.id)) {
      throw new Error(`Monitor "${options.id}" is already registered`);
    }
    this.registered.set(options.id, options);
    this.hooks.emit("monitor.registered", { name: options.id, type: options.type });
  }

  /**
   * Start a registered monitor for an issue.
   * If already running for this issue, this is a no-op.
   *
   * @param id - Monitor id (from registerMonitor)
   * @param issueId - Issue to monitor
   * @throws If monitor id is not registered
   */
  startMonitor(id: string, issueId: string): void {
    const options = this.registered.get(id);
    if (!options) {
      throw new Error(`Monitor "${id}" is not registered. Call registerMonitor() first.`);
    }

    const key = this.makeKey(issueId, id);
    if (this.running.has(key)) return;

    const monitor = new Monitor(options);
    monitor.start({
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
  stopMonitor(issueId: string, id: string): void {
    const key = this.makeKey(issueId, id);
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

  private makeKey(issueId: string, id: string): string {
    return `${issueId}:${id}`;
  }
}
