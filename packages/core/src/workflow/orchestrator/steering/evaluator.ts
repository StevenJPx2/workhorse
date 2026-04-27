import type { Issue } from "#db";
import type { MemoryService } from "#services/memory";
import type { Database } from "#db/database";
import type {
  RecentHookEvent,
  SteeringCondition,
  SteeringContext,
  SteeringRule,
} from "#workflow/orchestrator/steering/types";

export async function evaluateRules(
  rules: Map<string, SteeringRule>,
  ctx: SteeringContext,
  firedOnce: Map<string, Set<string>>,
): Promise<{ matching: Array<{ rule: SteeringRule; reminder: string }>; firedRules: string[] }> {
  const matching: Array<{ rule: SteeringRule; reminder: string }> = [];
  const firedRules: string[] = [];

  for (const rule of rules.values()) {
    if (rule.once) {
      const fired = firedOnce.get(ctx.issue.externalId);
      if (fired?.has(rule.id)) continue;
    }

    if (!(await matchesCondition(rule.condition, ctx))) continue;

    const reminder = typeof rule.reminder === "function" ? await rule.reminder(ctx) : rule.reminder;
    matching.push({ rule, reminder });

    if (rule.once) firedRules.push(rule.id);
  }

  matching.sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0));
  return { matching, firedRules };
}

export async function matchesCondition(
  condition: SteeringCondition,
  ctx: SteeringContext,
): Promise<boolean> {
  if (condition.status) {
    if (!toArray(condition.status).includes(ctx.issue.status)) return false;
  }
  if (condition.source) {
    if (!toArray(condition.source).includes(ctx.issue.source)) return false;
  }
  if (condition.hook) {
    if (!toArray(condition.hook).some((h) => ctx.recentHooks.some((r) => r.name === h)))
      return false;
  }
  if (condition.when) {
    if (!(await condition.when(ctx))) return false;
  }
  return true;
}

function toArray<T>(val: T | T[]): T[] {
  return Array.isArray(val) ? val : [val];
}

export function buildContext(
  issue: Issue,
  db: Database,
  memory: MemoryService,
  recentHooks: Map<string, RecentHookEvent[]>,
): SteeringContext {
  return {
    issue,
    adapter: null as unknown as SteeringContext["adapter"],
    db,
    memory,
    notifications: memory.notifications.getUnread(issue.externalId),
    hasPR: Boolean(issue.prUrl),
    recentTools: [],
    recentHooks: recentHooks.get(issue.externalId) ?? [],
  };
}

export function formatReminders(reminders: string[]): string {
  if (reminders.length === 1) {
    return `📋 **Reminder:**\n\n${reminders[0]}`;
  }
  return `📋 **Reminders:**\n\n${reminders.map((r, i) => `${i + 1}. ${r}`).join("\n\n")}`;
}
