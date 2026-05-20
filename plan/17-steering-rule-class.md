# 17: Convert SteeringRule to a Class (COMPLETED)

## Goal

Make `SteeringRule` a fully autonomous class that subscribes to hooks, evaluates conditions, and emits reminders directly — no external orchestration needed.

## Final Architecture

```
AgentAdapter (owns per-issue resources)
  └── SteeringRule[] (autonomous rules that evaluate themselves)
        ├── subscribes to agent.idle (debounced)
        ├── subscribes to condition hooks
        ├── evaluates conditions on idle
        └── emits steering.reminder directly
```

## What Changed

### Before

- `SteeringRule` was an **interface** with plain data
- `evaluateRules()` and `matchesCondition()` were **standalone functions** in `evaluator.ts`
- `SteeringService` orchestrated evaluation, tracked `firedOnce` set, managed hook subscriptions
- `SteeringContext` passed issue/status/recentHooks to evaluator

### After

- `SteeringRule` is a **class** that owns its behavior and state
- Rules subscribe to `agent.idle` themselves (debounced via `es-toolkit`)
- Rules track their own `fired`, `recentHooks`, `lastReminderTime` state
- Rules emit `steering.reminder` hook directly
- `SteeringService` **deleted** — was just a thin wrapper
- `evaluator.ts` **deleted** — logic moved into rule
- `SteeringContext` **deleted** — rules have direct access to `this.issue`

## Key Design Decisions

1. **Rules are fully autonomous** — Subscribe to hooks, evaluate, emit reminders themselves
2. **Empty array = no filter** — `condition.status = []` means "don't filter on status"
3. **`when` default is `true`** — Rules without `when` condition always pass
4. **Zod for normalization** — Schema transforms flexible input to strict types
5. **`z.input<>` for input type** — Derives input type from schema instead of manual interface
6. **Removed introspection** — No `hasFired()`, `hasRecentHook()`, `getRecentHooks()` exposed
7. **`SteeringService` removed** — `AgentAdapter` creates rules directly

## Final File Structure

| File                              | Description                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `steering/rule.ts`                | `SteeringRule` class — autonomous evaluation, hook subscriptions, reminder emission |
| `steering/types.ts`               | Zod schemas, `SteeringRuleConfig`, `SteeringRuleConfigInput`, `RecentHookEvent`     |
| `steering/index.ts`               | Exports (no `SteeringService`)                                                      |
| `steering/__tests__/rule.test.ts` | Tests for `SteeringRule` class                                                      |
| `steering/__tests__/fixtures.ts`  | `createRule()`, `createMockHooks()`, `baseIssue`                                    |

### Deleted Files

- `steering/service.ts` — Removed (was thin wrapper)
- `steering/evaluator.ts` — Removed (logic in rule)
- `steering/__tests__/service.test.ts` — Removed

## SteeringRule Class API

```typescript
export class SteeringRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: number;
  readonly once: boolean;
  readonly issue: Issue;

  constructor(
    config: SteeringRuleConfig,
    hooks: HookEmitter,
    issue: Issue,
    steeringConfig: SteeringConfig,
  );

  /** Cleanup hook subscriptions */
  dispose(): void;
}
```

**Internal behavior:**

- Subscribes to `agent.idle` (debounced by `steeringConfig.debounceMs`)
- Subscribes to hooks in `condition.hook[]` to track recent events
- On idle: evaluates conditions, emits `steering.reminder` if matched
- Respects `once`, `maxReminders`, `cooldownMs` settings

## Zod Schema

```typescript
export const SteeringRuleConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  condition: SteeringConditionSchema.optional().default({ ... }),
  reminder: z.union([z.string(), z.function(...)]).transform(...),
  priority: z.number().optional().default(0),
  once: z.boolean().optional().default(false),
});

export const SteeringConditionSchema = z.object({
  status: arrayUnionSchema(IssueStatusSchema),  // T | T[] | undefined → T[]
  source: arrayUnionSchema(z.string()),
  hook: arrayUnionSchema(z.string()),
  when: z.function(...).optional().transform(fn => fn ?? async () => true),
});
```

## Plugin Registration (Unchanged)

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "jira:update-after-implementation",
  name: "Update Jira after implementation",
  condition: { source: "jira", status: "implementing" },
  reminder: "Consider updating the Jira ticket...",
  priority: 10,
});
```

## AgentAdapter Integration

```typescript
// In AgentAdapter constructor:
this.steering = this.orchestrator.getSteeringRules().map((rule) => {
  return new SteeringRule(rule, this.hooks, this.issue, this.orchestrator.config.steering);
});

// In stop():
for (const rule of this.steering) rule.dispose();
```

## Completion Summary

- [x] `SteeringRule` class with autonomous hook subscriptions
- [x] Debounced idle handling via `es-toolkit`
- [x] Zod schemas with transforms for normalization
- [x] Empty array = no filter logic
- [x] `when` default is `true`
- [x] `SteeringService` removed
- [x] `evaluator.ts` removed
- [x] `SteeringContext` removed
- [x] All tests passing (280 passed)
- [x] TypeScript clean

## Dependencies

- Depends on: `16-consolidate-spawn-logic.md` (completed)
