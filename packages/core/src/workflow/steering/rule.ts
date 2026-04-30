/**
 * SteeringRule class - Fully autonomous rule evaluation.
 *
 * Rules subscribe to agent.idle, evaluate conditions, and emit reminders directly.
 */

import { debounce } from "es-toolkit";
import type { Issue } from "#db";
import type { HookEmitter, HookEventName } from "#lib/hooks";
import type { RecentHookEvent, SteeringRuleConfig } from "./types.ts";

/** Steering behavior config passed from service. */
interface SteeringConfig {
  debounceMs: number;
  cooldownMs: number;
  maxReminders: number;
}

/**
 * SteeringRule - Autonomous rule that evaluates itself and emits reminders.
 */
export class SteeringRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: number;
  readonly once: boolean;
  readonly issue: Issue;

  private readonly hooks: HookEmitter;
  private readonly config: SteeringRuleConfig;
  private readonly steeringConfig: SteeringConfig;

  private fired = false;
  private recentHooks: RecentHookEvent[] = [];
  private disposers: (() => void)[] = [];
  private lastReminderTime = 0;

  constructor(
    config: SteeringRuleConfig,
    hooks: HookEmitter,
    issue: Issue,
    steeringConfig: SteeringConfig,
  ) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.priority = config.priority;
    this.once = config.once;
    this.config = config;
    this.hooks = hooks;
    this.issue = issue;
    this.steeringConfig = steeringConfig;

    // Subscribe to idle agent events
    this.subscribe(
      "agent.idle",
      debounce((payload: unknown) => {
        if ((payload as { issueId?: string }).issueId !== this.issue.externalId) return;
        this.evaluate();
      }, this.steeringConfig.debounceMs),
    );

    // Subscribe to hook events from condition (already normalized to string[])
    for (const hookName of config.condition.hook) {
      this.subscribe(hookName);
    }
  }

  reset(): void {
    this.fired = false;
    this.recentHooks = [];
  }

  dispose(): void {
    for (const disposer of this.disposers) {
      disposer();
    }
    this.disposers = [];
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private subscribe(name: HookEventName, handler?: (payload: unknown) => void): void {
    const handlerWrapper = (payload: unknown) => {
      const issueId = (payload as { issueId?: string }).issueId;

      if (issueId !== this.issue.externalId) return;

      this.recentHooks.push({ name, timestamp: Date.now(), payload });

      if (this.recentHooks.length > 10) this.recentHooks.shift();

      handler?.(payload);
    };

    this.hooks.on(name, handlerWrapper);
    this.disposers.push(() => this.hooks.off(name, handlerWrapper));
  }

  private async evaluate(): Promise<void> {
    if (this.once && this.fired) return;

    if (Date.now() - this.lastReminderTime < this.steeringConfig.cooldownMs) return;

    const { condition, reminder } = this.config;

    // Empty array = no filter (always pass), non-empty = must match
    if (condition.status.length > 0 && !condition.status.includes(this.issue.status)) return;

    if (condition.source.length > 0 && !condition.source.includes(this.issue.source)) return;

    if (
      condition.hook.length > 0 &&
      !condition.hook.some((hookName) => this.recentHooks.some((h) => h.name === hookName))
    )
      return;

    if (!(await condition.when(this))) return;

    if (this.once) this.fired = true;

    this.lastReminderTime = Date.now();

    this.hooks.emit("steering.reminder", {
      issueId: this.issue.externalId,
      reminder: `📋 **Reminder:**\n\n${await reminder(this)}`,
    });

    this.recentHooks = [];
  }
}
