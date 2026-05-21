# Step 13: Idle Steering & Plugin Hooks

> **⚠️ Partially Superseded:** The `SteeringService` class described in this document was removed in Step 17. The steering system now uses autonomous `SteeringRule` instances created directly by `AgentAdapter`. See `plan/17-steering-rule-class.md` for the current architecture.
>
> **Still valid:** Plugin hooks, steering rule registration API, and the conceptual design remain accurate.

Two related enhancements to the orchestrator:

1. **Plugin Hooks** — Plugins can define and emit their own hooks for cross-plugin coordination
2. **Idle Steering** — Plugin-driven system reminders when agents become idle

**Location:** `packages/core/src/workflow/steering/`

**Deps:** None (uses existing hooks system)

## Problem

**Cross-plugin coordination:** GitHub plugin knows when a PR is merged, but Jira plugin needs to react to that event. Currently no way for plugins to communicate.

**Agent guidance:** Agents complete tasks but don't always know what to do next. Without guidance:

- Code is written but no PR is created
- PR is created but Jira isn't updated
- Review feedback is received but not addressed

We need:

1. A way for plugins to emit their own hooks
2. A way for plugins to inject workflow-specific nudges at the right time

---

## Part 1: Plugin Hooks

Plugins can emit custom hooks that other plugins can listen to. The existing `HookEventMap` already supports this via `[custom: string]: unknown`, but we formalize the pattern.

### Hook Naming Convention

Plugin hooks use a namespaced format: `{plugin}:{entity}.{event}`

```typescript
// GitHub plugin hooks
"github:pr.created";
"github:pr.merged";
"github:pr.closed";
"github:review.submitted";
"github:checks.passed";
"github:checks.failed";

// Jira plugin hooks
"jira:issue.transitioned";
"jira:comment.added";
```

### Emitting Plugin Hooks

Plugins emit hooks via the standard `ctx.hooks.emit()`:

```typescript
// packages/plugins/github/src/monitor.ts
// In the PR monitor, when we detect a merge:

if (pr.merged && !previousState.merged) {
  ctx.hooks.emit("github:pr.merged", {
    issueId: issue.externalId,
    pr: {
      number: pr.number,
      url: pr.html_url,
      mergedBy: pr.merged_by?.login,
      mergedAt: pr.merged_at,
    },
  });
}
```

### Listening to Plugin Hooks

Plugins listen via `ctx.hooks.on()`:

```typescript
// packages/plugins/jira/src/sync.ts
export function registerCrossPluginSync(ctx: WorkhorseContext): void {
  // When GitHub PR is merged, transition Jira to "In QA" and assign to reporter
  ctx.hooks.on("github:pr.merged", async ({ issueId, pr }) => {
    const issue = ctx.db.issues.getByExternalId(issueId);
    if (!issue || issue.source !== "jira") return;

    // Fetch full issue to get reporter
    const jiraIssue = await ctx.jiraClient.fetchIssue(issue.externalId);
    const reporterAccountId = jiraIssue.fields.reporter?.accountId;

    // Transition to "In QA"
    const transitions = await ctx.jiraClient.getTransitions(issue.externalId);
    const qaTransition = transitions.find(
      (t) =>
        t.name.toLowerCase().includes("qa") ||
        t.name.toLowerCase().includes("review") ||
        t.name.toLowerCase().includes("testing"),
    );

    if (qaTransition) {
      await ctx.jiraClient.transitionIssue(issue.externalId, qaTransition.id);
    }

    // Assign to reporter for QA
    if (reporterAccountId) {
      await ctx.jiraClient.editIssue(issue.externalId, {
        assignee: { accountId: reporterAccountId },
      });
    }

    await ctx.jiraClient.addComment(
      issue.externalId,
      `✅ PR #${pr.number} has been merged. Assigned to reporter for QA.`,
    );
  });
}
```

### Plugin Hook Types

For type safety, plugins export their hook types:

```typescript
// packages/plugins/github/src/hooks.ts
export interface GitHubPluginHooks {
  "github:pr.created": {
    issueId: string;
    pr: { number: number; url: string; title: string };
  };
  "github:pr.merged": {
    issueId: string;
    pr: { number: number; url: string; mergedBy?: string; mergedAt: string };
  };
  "github:pr.closed": {
    issueId: string;
    pr: { number: number; url: string };
  };
  "github:review.submitted": {
    issueId: string;
    review: { state: string; author: string; body: string };
  };
  "github:checks.passed": {
    issueId: string;
    pr: { number: number };
  };
  "github:checks.failed": {
    issueId: string;
    pr: { number: number };
    failedChecks: Array<{ name: string; url: string }>;
  };
}
```

```typescript
// packages/plugins/jira/src/hooks.ts
export interface JiraPluginHooks {
  "jira:issue.transitioned": {
    issueId: string;
    from: string;
    to: string;
  };
  "jira:comment.added": {
    issueId: string;
    comment: { id: string; author: string; body: string };
  };
}
```

### Core HookEventMap Extension

The core `HookEventMap` can be augmented by plugins via module augmentation:

```typescript
// packages/plugins/github/src/index.ts
declare module "workhorse-core" {
  interface HookEventMap extends GitHubPluginHooks {}
}
```

This gives type safety when other code listens to GitHub hooks.

### Cross-Plugin Coordination Examples

**GitHub PR merged → Jira "In QA" + assign to reporter:**

```typescript
// jira/src/sync.ts
ctx.hooks.on("github:pr.merged", async ({ issueId, pr }) => {
  const jiraIssue = await fetchIssue(issueId);
  await transitionToStatus(issueId, "In QA");
  await assignTo(issueId, jiraIssue.fields.reporter.accountId);
  await addComment(
    issueId,
    `✅ PR #${pr.number} merged. Assigned to reporter for QA.`,
  );
});
```

**GitHub checks failed → Jira comment:**

```typescript
// jira/src/sync.ts
ctx.hooks.on("github:checks.failed", async ({ issueId, failedChecks }) => {
  const names = failedChecks.map((c) => c.name).join(", ");
  await addComment(issueId, `⚠️ CI checks failed: ${names}`);
});
```

**Jira issue transitioned → GitHub label:**

```typescript
// github/src/sync.ts
ctx.hooks.on("jira:issue.transitioned", async ({ issueId, to }) => {
  if (to === "blocked") {
    await addLabel(issueId, "blocked");
  }
});
```

---

## Part 2: Idle Steering

Plugin-driven system reminders that guide the agent through workflows when it becomes idle.

### Idle Detection

The orchestrator detects when an agent becomes idle:

1. Agent finishes streaming output
2. No tool calls in progress
3. Agent is waiting for user input

This is detected via adapter events. Each adapter emits `agent.idle` when it detects this state.

```typescript
// Hook event
"agent.idle": { issueId: string; status: IssueStatus }
```

### Steering Rules

Plugins register steering rules — conditions + reminder content. When the agent goes idle, all matching rules fire.

```typescript
interface SteeringRule {
  id: string;
  name: string;
  description: string;

  /** When should this rule apply? */
  condition: SteeringCondition;

  /** What reminder to send */
  reminder: string | ((ctx: SteeringContext) => string | Promise<string>);

  /** Priority for ordering (higher = earlier). Default: 0 */
  priority?: number;

  /** Only fire once per session? Default: false */
  once?: boolean;
}

interface SteeringCondition {
  /** Issue status(es) that trigger this rule */
  status?: IssueStatus | IssueStatus[];

  /** Issue source(s) this applies to */
  source?: string | string[]; // "jira", "github", etc.

  /** Hook event(s) that must have recently fired for this issue */
  hook?: string | string[]; // e.g. "github:pr.merged"

  /** Custom predicate for complex conditions */
  when?: (ctx: SteeringContext) => boolean | Promise<boolean>;
}

interface SteeringContext {
  issue: Issue;
  adapter: AgentAdapter;
  db: Database;
  memory: MemoryService;

  /** Notifications for this issue */
  notifications: Notification[];

  /** Has a PR been created? */
  hasPR: boolean;

  /** Recent tool calls (last N) */
  recentTools: Array<{ name: string; timestamp: number }>;

  /** Recent hook events for this issue */
  recentHooks: Array<{ name: string; timestamp: number; payload: unknown }>;
}
```

### SteeringService

```typescript
// workflow/orchestrator/steering/service.ts
class SteeringService {
  private rules = new Map<string, SteeringRule>();
  private firedOnce = new Map<string, Set<string>>(); // issueId -> ruleIds

  constructor(
    private db: Database,
    private memory: MemoryService,
    private hooks: Emitter<HookEventMap>,
  ) {
    // Subscribe to idle events
    this.hooks.on("agent.idle", this.handleIdle.bind(this));
  }

  /** Register a steering rule */
  registerRule(rule: SteeringRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Unregister a steering rule */
  unregisterRule(id: string): void {
    this.rules.delete(id);
  }

  /** Get all registered rules */
  getRules(): SteeringRule[] {
    return Array.from(this.rules.values());
  }

  /** Handle agent idle event */
  private async handleIdle({
    issueId,
    status,
  }: {
    issueId: string;
    status: IssueStatus;
  }): Promise<void> {
    const issue = this.db.issues.getByExternalId(issueId);
    if (!issue) return;

    const ctx = await this.buildContext(issue);
    const reminders = await this.evaluateRules(ctx);

    if (reminders.length > 0) {
      const combined = this.formatReminders(reminders);
      this.hooks.emit("steering.reminder", { issueId, reminder: combined });
    }
  }

  private async evaluateRules(ctx: SteeringContext): Promise<string[]> {
    const matching: Array<{ rule: SteeringRule; reminder: string }> = [];

    for (const rule of this.rules.values()) {
      // Check once-per-session rules
      if (rule.once) {
        const fired = this.firedOnce.get(ctx.issue.externalId);
        if (fired?.has(rule.id)) continue;
      }

      // Evaluate condition
      if (!(await this.matchesCondition(rule.condition, ctx))) continue;

      // Generate reminder
      const reminder =
        typeof rule.reminder === "function"
          ? await rule.reminder(ctx)
          : rule.reminder;

      matching.push({ rule, reminder });

      // Mark as fired for once-per-session rules
      if (rule.once) {
        if (!this.firedOnce.has(ctx.issue.externalId)) {
          this.firedOnce.set(ctx.issue.externalId, new Set());
        }
        this.firedOnce.get(ctx.issue.externalId)!.add(rule.id);
      }
    }

    // Sort by priority (descending)
    matching.sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0));

    return matching.map((m) => m.reminder);
  }

  private async matchesCondition(
    condition: SteeringCondition,
    ctx: SteeringContext,
  ): Promise<boolean> {
    // Check status
    if (condition.status) {
      const statuses = Array.isArray(condition.status)
        ? condition.status
        : [condition.status];
      if (!statuses.includes(ctx.issue.status)) return false;
    }

    // Check source
    if (condition.source) {
      const sources = Array.isArray(condition.source)
        ? condition.source
        : [condition.source];
      if (!sources.includes(ctx.issue.source)) return false;
    }

    // Check hook events
    if (condition.hook) {
      const hooks = Array.isArray(condition.hook)
        ? condition.hook
        : [condition.hook];
      const hasRecentHook = hooks.some((h) =>
        ctx.recentHooks.some((r) => r.name === h),
      );
      if (!hasRecentHook) return false;
    }

    // Check custom predicate
    if (condition.when) {
      if (!(await condition.when(ctx))) return false;
    }

    return true;
  }

  private async buildContext(issue: Issue): Promise<SteeringContext> {
    return {
      issue,
      adapter: null!, // Set by orchestrator
      db: this.db,
      memory: this.memory,
      notifications: this.memory.getNotifications(issue.externalId),
      hasPR: Boolean(issue.prUrl),
      recentTools: [], // TODO: Track in adapter
      recentHooks: [], // TODO: Track hook events
    };
  }

  private formatReminders(reminders: string[]): string {
    if (reminders.length === 1) {
      return `📋 **Reminder:**\n\n${reminders[0]}`;
    }
    return `📋 **Reminders:**\n\n${reminders.map((r, i) => `${i + 1}. ${r}`).join("\n\n")}`;
  }

  /** Clear fired-once state for an issue (call on spawn) */
  resetForIssue(issueId: string): void {
    this.firedOnce.delete(issueId);
  }
}
```

### Orchestrator Integration

The orchestrator creates the SteeringService and delivers reminders:

```typescript
// workflow/orchestrator/orchestrator.ts
class HarnessOrchestrator {
  private steering: SteeringService;

  constructor(...) {
    this.steering = new SteeringService(db, memory, hooks);

    // Deliver reminders to agents
    this.hooks.on("steering.reminder", async ({ issueId, reminder }) => {
      const agent = this.agents.get(issueId);
      if (agent?.state === "running") {
        await agent.sendMessage(reminder);
      }
    });
  }

  /** Expose steering registration to plugins */
  registerSteeringRule(rule: SteeringRule): void {
    this.steering.registerRule(rule);
  }

  unregisterSteeringRule(id: string): void {
    this.steering.unregisterRule(id);
  }
}
```

### Adapter Idle Detection

Each adapter must emit `agent.idle` when it detects the agent is waiting. Example for Pi:

```typescript
// plugins/pi-adapter/adapter.ts
class PiAgentAdapter extends AgentAdapter {
  private subscribeToEvents() {
    this.session?.subscribe((event) => {
      // ... existing event handling ...

      // Detect idle state
      if (event.type === "stream_end") {
        // Agent finished streaming, now idle
        this.ctx.hooks.emit("agent.idle", {
          issueId: this.issueId,
          status: this.ctx.issue.status,
        });
      }
    });
  }
}
```

## Plugin Registration

Plugins register steering rules via the context:

```typescript
// Plugin context type extension
interface PluginContext {
  // ... existing ...
  orchestrator: {
    // ... existing ...
    registerSteeringRule(rule: SteeringRule): void;
    unregisterSteeringRule(id: string): void;
  };
}
```

## Example: Jira Plugin Steering Rules

```typescript
// packages/plugins/jira/src/steering.ts
import type { SteeringRule, WorkhorseContext } from "workhorse-core";

export function registerJiraSteering(ctx: WorkhorseContext): void {
  // Remind to update Jira after implementation
  ctx.orchestrator.registerSteeringRule({
    id: "jira:update-after-implementation",
    name: "Update Jira after implementation",
    description:
      "Remind to add a comment or transition Jira after implementing",
    condition: {
      source: "jira",
      status: "in_progress",
      when: async (steerCtx) => {
        // Only if recent tools include file edits but no jira tools
        const hasEdits = steerCtx.recentTools.some((t) =>
          ["edit", "write", "create_file"].includes(t.name),
        );
        const hasJiraUpdate = steerCtx.recentTools.some((t) =>
          t.name.startsWith("jira_"),
        );
        return hasEdits && !hasJiraUpdate;
      },
    },
    reminder: `You've made code changes. Consider:
- Adding a progress comment to the Jira ticket with \`jira_add_comment\`
- If the fix is complete, transition the ticket with \`jira_transition_issue\``,
    priority: 10,
  });

  // Remind to transition after PR is merged
  ctx.orchestrator.registerSteeringRule({
    id: "jira:transition-after-merge",
    name: "Transition Jira after PR merge",
    description: "Remind to close the Jira ticket after PR is merged",
    condition: {
      source: "jira",
      status: "pr_created",
      when: async (steerCtx) => {
        // Check if PR was just merged (would need PR status in context)
        return false; // TODO: Implement
      },
    },
    reminder: `The PR has been merged! Transition the Jira ticket to "In QA" and assign to reporter with \`jira_transition_issue\`.`,
    priority: 20,
    once: true,
  });

  // Remind about review feedback
  ctx.orchestrator.registerSteeringRule({
    id: "jira:address-feedback",
    name: "Address review feedback",
    description:
      "Remind to address comments when there are unacknowledged notifications",
    condition: {
      source: "jira",
      when: async (steerCtx) => {
        const unacked = steerCtx.notifications.filter((n) => !n.acknowledged);
        return unacked.length > 0;
      },
    },
    reminder: (steerCtx) => {
      const unacked = steerCtx.notifications.filter((n) => !n.acknowledged);
      return `You have ${unacked.length} unread notification(s). Check the notification inbox and address any feedback.`;
    },
    priority: 5,
  });
}
```

## Example: GitHub Plugin Steering Rules

```typescript
// packages/plugins/github/src/steering.ts
import type { SteeringRule, WorkhorseContext } from "workhorse-core";

export function registerGitHubSteering(ctx: WorkhorseContext): void {
  // Remind to create PR after implementation
  ctx.orchestrator.registerSteeringRule({
    id: "github:create-pr",
    name: "Create PR after implementation",
    description: "Remind to create a PR when code is ready",
    condition: {
      status: "in_progress",
      when: async (steerCtx) => {
        // Has code changes but no PR yet
        const hasEdits = steerCtx.recentTools.some((t) =>
          ["edit", "write", "create_file"].includes(t.name),
        );
        return hasEdits && !steerCtx.hasPR;
      },
    },
    reminder: `You've made code changes but haven't created a PR yet. When ready:
1. Run tests to verify the fix
2. Create a PR with \`github_open_pr\``,
    priority: 15,
  });

  // Remind to push changes
  ctx.orchestrator.registerSteeringRule({
    id: "github:push-changes",
    name: "Push changes before PR",
    description: "Remind to commit and push before creating PR",
    condition: {
      when: async (steerCtx) => {
        // Check for uncommitted changes (would need git status in context)
        return false; // TODO: Implement
      },
    },
    reminder: `You have uncommitted changes. Commit and push before creating a PR.`,
    priority: 16,
  });

  // Remind about CI failures
  ctx.orchestrator.registerSteeringRule({
    id: "github:fix-ci",
    name: "Fix CI failures",
    description: "Remind to fix CI when checks fail",
    condition: {
      status: "pr_created",
      when: async (steerCtx) => {
        const ciFailure = steerCtx.notifications.find(
          (n) => n.type === "ci_failure" && !n.acknowledged,
        );
        return Boolean(ciFailure);
      },
    },
    reminder: (steerCtx) => {
      const ciFailure = steerCtx.notifications.find(
        (n) => n.type === "ci_failure",
      );
      return `CI checks are failing. Review the error and fix the issue:\n\n${ciFailure?.message ?? "Check the PR for details."}`;
    },
    priority: 25,
    once: true,
  });

  // Remind about review comments
  ctx.orchestrator.registerSteeringRule({
    id: "github:address-review",
    name: "Address PR review comments",
    description: "Remind to address review feedback",
    condition: {
      status: "pr_created",
      when: async (steerCtx) => {
        const reviewRequest = steerCtx.notifications.find(
          (n) =>
            n.type === "review" && n.priority === "high" && !n.acknowledged,
        );
        return Boolean(reviewRequest);
      },
    },
    reminder: `A reviewer has requested changes on your PR. Address the feedback and push updates.`,
    priority: 20,
  });
}
```

## Core Steering Rules

Core can also register basic steering rules:

```typescript
// plugins/builtin/steering.ts
export function registerCoreSteering(ctx: WorkhorseContext): void {
  // Generic "what's next" reminder
  ctx.orchestrator.registerSteeringRule({
    id: "core:whats-next",
    name: "What's next prompt",
    description: "Generic prompt to continue or wrap up",
    condition: {
      // Always applies as a fallback
    },
    reminder: `Task update:
- If you've completed your current task, update the issue status
- If you're blocked, use \`workhorse_escalate\` to ask for help
- If you need more context, check the notification inbox`,
    priority: -10, // Low priority, acts as fallback
  });
}
```

## Hook Events

```typescript
// lib/hooks/types.ts
"agent.idle": { issueId: string; status: IssueStatus }
"steering.reminder": { issueId: string; reminder: string }
```

## File Structure

```
packages/core/src/workflow/orchestrator/
├── steering/
│   ├── index.ts              # Public exports
│   ├── service.ts            # SteeringService class
│   └── types.ts              # SteeringRule, SteeringCondition, SteeringContext
├── orchestrator.ts           # Updated with steering integration
└── ...
```

## Configuration

Optional config for steering behavior:

```toml
[steering]
enabled = true
debounce_ms = 2000  # Wait before sending reminder (avoids spam)
max_reminders = 3   # Max reminders per idle event
cooldown_ms = 30000 # Min time between reminders for same issue
```

```typescript
// config/schema.ts
steering: z.object({
  enabled: z.boolean().default(true),
  debounceMs: z.number().int().positive().default(2000),
  maxReminders: z.number().int().positive().default(3),
  cooldownMs: z.number().int().positive().default(30000),
}).default({}),
```

## Tests

- **SteeringService**: registers rules, evaluates conditions, fires reminders
- **Condition matching**: status filter, source filter, custom predicate
- **Once-per-session**: rule only fires once, resets on spawn
- **Priority ordering**: higher priority reminders come first
- **Debouncing**: rapid idle events don't spam reminders
- **Cooldown**: same issue doesn't get reminded too frequently
- **Plugin integration**: Jira/GitHub rules fire at correct times
- **Reminder delivery**: orchestrator sends to correct agent

## Benefits

1. **Plugin-driven**: Each plugin knows its own workflow best
2. **Composable**: Multiple plugins can contribute rules
3. **Configurable**: Rules can be conditional and prioritized
4. **Non-intrusive**: Only fires when agent is idle, not interrupting work
5. **Extensible**: Easy to add new rules without touching core
