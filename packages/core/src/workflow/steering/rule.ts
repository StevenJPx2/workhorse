/**
 * SteeringRule class - Fully autonomous rule evaluation.
 *
 * Rules subscribe to agent.idle, evaluate conditions, and emit reminders directly.
 * Builds a SteeringContext for condition/reminder callbacks.
 */

import { debounce } from "es-toolkit";
import type { Issue, Notification } from "#db";
import type { HookEmitter, HookEventName } from "#lib/hooks";
import type {
  HookHistoryEntry,
  SteeringContext,
  SteeringRuleConfig,
  ToolHistoryEntry,
} from "./types.ts";

/** Steering behavior config passed from service. */
export interface SteeringConfig {
  debounceMs: number;
  cooldownMs: number;
  maxReminders: number;
}

/** Options for creating a SteeringRule. */
export interface SteeringRuleOptions {
  config: SteeringRuleConfig;
  hooks: HookEmitter;
  issue: Issue;
  steeringConfig: SteeringConfig;
  /** Function to get unread notifications for this issue */
  getNotifications: () => Promise<Notification[]>;
}

/**
 * SteeringRule - Autonomous rule that evaluates itself and emits reminders.
 *
 * Builds a `SteeringContext` containing issue, notifications, and toolHistory
 * to pass to condition `when()` and `reminder()` callbacks.
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
  private readonly getNotifications: () => Promise<Notification[]>;

  private fired = false;
  private hookHistory: HookHistoryEntry[] = [];
  private toolHistory: ToolHistoryEntry[] = [];
  private disposers: (() => void)[] = [];
  private lastReminderTime = 0;

  constructor(options: SteeringRuleOptions) {
    const { config, hooks, issue, steeringConfig, getNotifications } = options;

    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.priority = config.priority;
    this.once = config.once;
    this.config = config;
    this.hooks = hooks;
    this.issue = issue;
    this.steeringConfig = steeringConfig;
    this.getNotifications = getNotifications;

    // Subscribe to idle agent events
    this.subscribe(
      "agent.idle",
      debounce((payload: unknown) => {
        if ((payload as { issueId?: string }).issueId !== this.issue.externalId) return;
        this.evaluate();
      }, this.steeringConfig.debounceMs),
    );

    // Track tool calls for this issue (no pruning - consumers filter by timestamp)
    this.subscribe("agent.tool_call", (payload: unknown) => {
      const { tool, args } = payload as { tool: string; args: unknown };
      this.toolHistory.push({ name: tool, args, timestamp: Date.now() });
    });

    // Subscribe to hook events from condition (already normalized to string[])
    for (const hookName of config.condition.hook) {
      this.subscribe(hookName);
    }
  }

  /** Build the context object passed to when() and reminder() callbacks. */
  private async buildContext(): Promise<SteeringContext> {
    return {
      issue: this.issue,
      notifications: await this.getNotifications(),
      toolHistory: this.toolHistory,
    };
  }

  reset(): void {
    this.fired = false;
    this.hookHistory = [];
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

      // No pruning - consumers filter by timestamp
      this.hookHistory.push({ name, timestamp: Date.now(), payload });

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
      !condition.hook.some((hookName) =>
        this.hookHistory.some((h: HookHistoryEntry) => h.name === hookName),
      )
    )
      return;

    const ctx = await this.buildContext();

    if (!(await condition.when(ctx))) return;

    if (this.once) this.fired = true;

    this.lastReminderTime = Date.now();

    this.hooks.emit("steering.reminder", {
      issueId: this.issue.externalId,
      reminder: `📋 **Reminder:**\n\n${await reminder(ctx)}`,
    });

    this.hookHistory = [];
  }
}
