/**
 * SteeringService - Plugin-driven idle agent guidance.
 *
 * Manages steering rules, evaluates conditions when agents go idle,
 * and emits reminders via the hooks system.
 */

import type { Database } from "#db/database";
import type { HookEmitter, HookEventMap } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import { buildContext, evaluateRules, formatReminders } from "./evaluator.ts";
import type { RecentHookEvent, SteeringRule } from "./types.ts";

/**
 * SteeringService manages rules that guide idle agents through workflows.
 */
export class SteeringService {
  private rules = new Map<string, SteeringRule>();
  private firedOnce = new Map<string, Set<string>>(); // issueId -> ruleIds
  private recentHooks = new Map<string, RecentHookEvent[]>(); // issueId -> hooks
  private cooldowns = new Map<string, number>(); // issueId -> last reminder timestamp
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: Database,
    private readonly memory: MemoryService,
    private readonly hooks: HookEmitter,
    private readonly config: {
      enabled: boolean;
      debounceMs: number;
      maxReminders: number;
      cooldownMs: number;
    },
  ) {
    this.hooks.on("agent.idle", this.handleIdle.bind(this));
  }

  /** Register a steering rule */
  registerRule(rule: SteeringRule): void {
    this.rules.set(rule.id, rule);
    if (rule.condition.hook) {
      for (const name of Array.isArray(rule.condition.hook)
        ? rule.condition.hook
        : [rule.condition.hook]) {
        this.ensureHookTracked(name);
      }
    }
  }

  private trackedHooks = new Set<string>();

  /** Start tracking a hook event for steering condition evaluation */
  private ensureHookTracked(name: string): void {
    if (this.trackedHooks.has(name)) return;
    this.trackedHooks.add(name);

    this.hooks.on(name as keyof HookEventMap, (payload: unknown) => {
      const p = payload as { issueId?: string };
      if (!p.issueId) return;

      const events = this.recentHooks.get(p.issueId) ?? [];
      events.push({
        name,
        timestamp: Date.now(),
        issueId: p.issueId,
        payload,
      });
      if (events.length > 10) events.shift();
      this.recentHooks.set(p.issueId, events);
    });
  }

  /** Unregister a steering rule */
  unregisterRule(id: string): void {
    this.rules.delete(id);
  }

  /** Get all registered rules */
  getRules(): SteeringRule[] {
    return Array.from(this.rules.values());
  }

  /** Clear fired-once state for an issue (call on spawn) */
  resetForIssue(issueId: string): void {
    this.firedOnce.delete(issueId);
    this.recentHooks.delete(issueId);
    this.cooldowns.delete(issueId);
  }

  /** Handle agent idle event */
  private handleIdle({ issueId, status, source }: HookEventMap["agent.idle"]): void {
    if (!this.config.enabled) return;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      void this.processIdle({ issueId, status, source });
    }, this.config.debounceMs);
  }

  private async processIdle({ issueId, source }: HookEventMap["agent.idle"]): Promise<void> {
    const lastReminder = this.cooldowns.get(issueId);
    if (lastReminder && Date.now() - lastReminder < this.config.cooldownMs) return;

    const issue = this.db.issues.getByExternalId(issueId, source);
    if (!issue) return;

    const { matching, firedRules } = await evaluateRules(
      this.rules,
      buildContext(issue, this.db, this.memory, this.recentHooks),
      this.firedOnce,
    );

    if (matching.length > 0) {
      for (const ruleId of firedRules) {
        if (!this.firedOnce.has(issueId)) this.firedOnce.set(issueId, new Set());
        this.firedOnce.get(issueId)!.add(ruleId);
      }
      this.cooldowns.set(issueId, Date.now());
      this.hooks.emit("steering.reminder", {
        issueId,
        reminder: formatReminders(
          matching.slice(0, this.config.maxReminders).map((m) => m.reminder),
        ),
      });
    }
  }
}
