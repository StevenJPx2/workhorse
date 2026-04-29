/**
 * SteeringService - Plugin-driven idle agent guidance (per-issue).
 *
 * Each adapter creates its own SteeringService instance bound to a specific issue.
 * Rules are global (managed by orchestrator), but state (firedOnce, cooldowns, recentHooks)
 * is per-issue.
 */

import type { Issue } from "#db";
import type { Database } from "#db/database";
import type { HookEmitter, HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { buildContext, evaluateRules, formatReminders } from "./evaluator.ts";
import type { RecentHookEvent, SteeringRule } from "./types.ts";

/** Configuration for steering behavior */
export interface SteeringConfig {
  enabled: boolean;
  debounceMs: number;
  maxReminders: number;
  cooldownMs: number;
}

/**
 * SteeringService manages steering for a single issue.
 *
 * Per-issue state (firedOnce, recentHooks, cooldowns) is owned by this instance.
 * Rules are fetched from the orchestrator via the getRules getter.
 */
export class SteeringService {
  // Per-issue state - no Maps keyed by issueId
  private firedOnce = new Set<string>();
  private recentHooks: RecentHookEvent[] = [];
  private lastReminderTime = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private trackedHookNames = new Set<string>();
  private disposed = false;

  // Store bound handlers for cleanup
  private readonly boundHandleIdle: (payload: HookEventMap["agent.idle"]) => void;
  private readonly hookHandlers = new Map<string, (payload: unknown) => void>();

  constructor(
    private readonly issue: Issue,
    private readonly db: Database,
    private readonly memory: MemoryService,
    private readonly hooks: HookEmitter,
    private readonly config: SteeringConfig,
    private readonly getRules: () => SteeringRule[],
  ) {
    this.boundHandleIdle = this.handleIdle.bind(this);
    this.hooks.on("agent.idle", this.boundHandleIdle);

    // Set up tracking for hooks referenced in existing rules
    for (const rule of this.getRules()) {
      if (rule.condition.hook) {
        for (const name of Array.isArray(rule.condition.hook)
          ? rule.condition.hook
          : [rule.condition.hook]) {
          this.ensureHookTracked(name);
        }
      }
    }
  }

  /** Start tracking a hook event for steering condition evaluation */
  private ensureHookTracked(name: string): void {
    if (this.trackedHookNames.has(name)) return;
    this.trackedHookNames.add(name);

    const handler = (payload: unknown) => {
      if (this.disposed) return;
      // Only track hooks for this issue
      if ((payload as { issueId?: string }).issueId !== this.issue.externalId) return;

      this.recentHooks.push({
        name,
        timestamp: Date.now(),
        issueId: this.issue.externalId,
        payload,
      });
      // Keep only last 10 events
      if (this.recentHooks.length > 10) this.recentHooks.shift();
    };

    this.hookHandlers.set(name, handler);
    this.hooks.on(name as keyof HookEventMap, handler);
  }

  /** Handle agent idle event - only process if it's for our issue */
  private handleIdle(e: HookEventMap["agent.idle"]): void {
    if (this.disposed || !this.config.enabled || e.issueId !== this.issue.externalId) return;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.processIdle(), this.config.debounceMs);
  }

  private async processIdle(): Promise<void> {
    if (this.disposed) return;

    // Cooldown check - simple number comparison
    if (Date.now() - this.lastReminderTime < this.config.cooldownMs) return;

    // Refresh issue from DB to get latest state
    const freshIssue = this.db.issues.getByExternalId(this.issue.externalId, this.issue.source);
    if (!freshIssue) return;

    const { matching, firedRules } = await evaluateRules(
      this.getRules(),
      buildContext(freshIssue, this.db, this.memory, this.recentHooks),
      this.firedOnce,
    );

    if (matching.length > 0) {
      for (const ruleId of firedRules) {
        this.firedOnce.add(ruleId);
      }
      this.lastReminderTime = Date.now();
      this.hooks.emit("steering.reminder", {
        issueId: this.issue.externalId,
        reminder: formatReminders(
          matching.slice(0, this.config.maxReminders).map((m) => m.reminder),
        ),
      });
    }
  }

  /** Cleanup when adapter stops - unsubscribe from all hooks */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Unsubscribe from agent.idle
    this.hooks.off("agent.idle", this.boundHandleIdle);

    // Unsubscribe from all tracked hooks
    for (const [name, handler] of this.hookHandlers) {
      this.hooks.off(name as keyof HookEventMap, handler);
    }
    this.hookHandlers.clear();
  }
}
