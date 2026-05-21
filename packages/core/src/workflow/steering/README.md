# Steering

Autonomous steering rules for idle agent guidance. Rules evaluate conditions and emit reminders without external orchestration.

## Overview

The steering system provides a way for plugins to register behavioral rules that guide agents when they become idle. Each rule is fully autonomous — it subscribes to hooks, evaluates conditions, and emits reminders on its own.

**Key design principle**: Rules are self-managing. Once created, they subscribe to relevant hooks, track history, evaluate conditions, and emit reminders without any external coordination.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      SteeringRule                              │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   Subscribe   │    │   Evaluate    │    │    Emit      │    │
│  │              │    │              │    │              │    │
│  │ agent.idle   │───►│ check status │───►│ steering.    │    │
│  │ custom hooks │    │ check source │    │ reminder     │    │
│  │ tool calls   │    │ check hooks  │    │              │    │
│  │              │    │ call when()  │    │              │    │
│  └──────────────┘    └──────────────┘    └──────────────┘    │
│                                                               │
│  State: hookHistory[], toolHistory[], fired, lastReminderTime │
└────────────────────────────────────────────────────────────────┘
```

## Usage

### Registering a Rule

Rules are registered with the orchestrator as plain config objects. The `AgentAdapter` creates `SteeringRule` instances with hooks/issue injected during initialization:

```typescript
// In plugin setup
ctx.orchestrator.registerSteeringRule({
  id: "review-reminder",
  name: "PR Review Reminder",
  description: "Reminds agents to check for PR reviews when idle",
  condition: {
    status: ["in_review"], // Only when issue is in_review
    hook: ["agent.idle"], // Only after agent goes idle
    when: async (ctx) => {
      // Custom condition check
      return ctx.notifications.some((n) => n.source === "github");
    },
  },
  reminder: async (ctx) => {
    const reviews = ctx.notifications.filter((n) => n.source === "github");
    return `You have ${reviews.length} unread review notification(s). Check for feedback.`;
  },
  priority: 10,
  once: false,
});
```

### Simple String Reminder

For static reminders, use a string instead of a function:

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "blocked-check",
  name: "Blocked Agent Check",
  description: "Asks blocked agents to check notifications",
  condition: {
    status: ["blocked"],
  },
  reminder:
    "You are marked as blocked. Check your notifications for human responses.",
  once: true, // Only fires once per agent session
});
```

### Minimal Rule

With defaults, a rule can be as simple as:

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "idle-nudge",
  name: "Idle Nudge",
  description: "General nudge when agent is idle",
  // condition defaults to: { status: [], source: [], hook: [], when: async () => true }
  reminder: "Are you still working? Check for any notifications.",
});
```

## Evaluation Flow

When an agent goes idle, each steering rule evaluates in this order:

```
1. Check `once` — if fired already, skip
2. Check cooldown — if too recent, skip
3. Check `issue.status === "blocked"` — never remind blocked agents
4. Check `condition.status` — if non-empty, must include current status
5. Check `condition.source` — if non-empty, must match issue source
6. Check `condition.hook` — if non-empty, at least one must appear in hookHistory
7. Build SteeringContext — fetch notifications, tool history
8. Call `condition.when(ctx)` — custom condition function
9. Emit `steering.reminder` hook with formatted reminder
```

## SteeringContext

Passed to `when()` and `reminder()` callbacks:

```typescript
interface SteeringContext {
  /** The issue this rule is evaluating */
  issue: Issue;
  /** Unread notifications for this issue */
  notifications: Notification[];
  /** History of tool calls made by the agent */
  toolHistory: ToolHistoryEntry[];
}
```

### Using SteeringContext

```typescript
when: async (ctx) => {
  // Check if there are unread GitHub notifications
  const hasGitHubNotifs = ctx.notifications.some(
    n => n.source === "github"
  );

  // Check if agent has already opened a PR
  const hasPROpened = ctx.toolHistory.some(
    t => t.name === "github_open_pr"
  );

  return hasGitHubNotifs && hasPROpened;
},

reminder: async (ctx) => {
  const reviewNotifs = ctx.notifications.filter(
    n => n.title.includes("review")
  );
  return `You have ${reviewNotifs.length} pending review(s). Address the feedback.`;
},
```

## Configuration

Steering behavior is controlled by the `steering` section in config:

```toml
[steering]
enabled = true
debounce_ms = 2000      # Debounce idle events (ms)
max_reminders = 3       # Max reminders per rule per session (not enforced yet)
cooldown_ms = 30000     # Minimum time between reminders (ms)
```

### SteeringConfig

```typescript
interface SteeringConfig {
  debounceMs: number; // Debounce agent.idle events before evaluation
  maxReminders: number; // Maximum reminders per rule
  cooldownMs: number; // Minimum time between reminders from same rule
}
```

## Condition Schema

Conditions are validated and normalized by Zod. The input format is flexible:

```typescript
// String → normalized to [string]
condition: {
  status: "in_review",            // → ["in_review"]
  source: "github",              // → ["github"]
  hook: "agent.idle",            // → ["agent.idle"]
}

// Array (already normalized)
condition: {
  status: ["in_review", "implementing"],
  source: ["github", "jira"],
  hook: ["agent.idle", "github:review.submitted"],
}

// Omit → defaults to empty array (no filter)
condition: {
  // status not specified → any status passes
  // source not specified → any source passes
  // hook not specified → no hook history required
}

// Custom when() function
condition: {
  when: async (ctx) => {
    // Arbitrary async condition
    return ctx.toolHistory.length > 5;
  },
}
```

## Built-in Steering Rules

### Jira Plugin Rules

- **Comment Response** — When a Jira comment is received and agent is idle, reminds to check notifications
- **Status Sync** — When agent updates status, reminds to sync with Jira transition

### GitHub Plugin Rules

- **PR Review** — When PR review is received and agent is idle, reminds to address feedback
- **CI Failure** — When CI checks fail and agent is idle, reminds to fix failing tests

## Rule Disposal

Steering rules are disposed when an agent stops. The `AgentAdapter.stop()` method calls `rule.dispose()` for each rule, which unsubscribes all hooks:

```typescript
// Automatic in AgentAdapter
for (const rule of this.steering) rule.dispose();
```

## Hooks

| Event                  | Payload                 | When                                        |
| ---------------------- | ----------------------- | ------------------------------------------- |
| `steering.reminder`    | `{ issueId, reminder }` | Rule evaluates to true and emits reminder   |
| `agent.idle`           | `{ issueId }`           | Agent becomes idle (triggers evaluation)    |
| `agent.tool_call`      | `{ tool, args }`        | Agent calls a tool (tracked in toolHistory) |
| `issue.status_changed` | `{ issue, from, to }`   | Issue status changes (tracked by rule)      |

## Types

### SteeringRuleConfig (normalized output)

```typescript
interface SteeringRuleConfig {
  id: string;
  name: string;
  description: string;
  condition: SteeringCondition;
  reminder: (ctx: SteeringContext) => Promise<string>;
  priority: number; // default: 0
  once: boolean; // default: false
}
```

### SteeringCondition (normalized output)

```typescript
interface SteeringCondition {
  status: IssueStatus[]; // default: []
  source: string[]; // default: []
  hook: string[]; // default: []
  when: (ctx: SteeringContext) => Promise<boolean>; // default: async () => true
}
```

### ToolHistoryEntry

```typescript
interface ToolHistoryEntry {
  name: string; // Tool name (e.g., "edit", "github_open_pr")
  args: unknown; // Arguments passed
  timestamp: number; // Unix timestamp
}
```

### HookHistoryEntry

```typescript
interface HookHistoryEntry {
  name: string; // Hook name
  timestamp: number; // Unix timestamp
  payload: unknown; // Hook payload
}
```

## Files

| File       | Purpose                                                          |
| ---------- | ---------------------------------------------------------------- |
| `rule.ts`  | SteeringRule class — autonomous evaluation and reminder emission |
| `types.ts` | Zod schemas and TypeScript types for steering configuration      |
| `index.ts` | Barrel exports                                                   |
