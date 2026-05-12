# Jiratown Steering Rules Guide

Steering rules provide autonomous guidance to agents when they become idle. This guide covers how to create, configure, and debug steering rules.

## Table of Contents

1. [Overview](#overview)
2. [How Steering Works](#how-steering-works)
3. [Creating Steering Rules](#creating-steering-rules)
4. [Condition Filters](#condition-filters)
5. [Reminder Functions](#reminder-functions)
6. [Configuration](#configuration)
7. [Built-in Rules](#built-in-rules)
8. [Debugging](#debugging)
9. [Best Practices](#best-practices)

---

## Overview

### What is Steering?

Steering is Jiratown's system for autonomously guiding agents when they become idle. Instead of manually reminding agents to check notifications or take actions, steering rules automatically evaluate conditions and emit reminders.

### Key Concepts

- **SteeringRule**: A class that subscribes to hooks, evaluates conditions, and emits reminders
- **SteeringCondition**: Filters that determine when a rule should fire
- **SteeringContext**: Runtime data passed to condition/reminder functions
- **Reminder**: The message sent to the agent

### Design Principles

1. **Autonomous**: Rules manage themselves — subscribe to hooks, track history, emit reminders
2. **Non-blocking**: Never remind when agent is `blocked` (waiting for human)
3. **Configurable**: Cooldown, once-only, and priority settings
4. **Composable**: Multiple rules can coexist and fire based on different conditions

---

## How Steering Works

### Lifecycle

```
1. Agent spawns
   └── AgentAdapter creates SteeringRule instances for each registered rule
       └── Each rule subscribes to relevant hooks

2. Agent becomes idle
   └── agent.idle hook fires (debounced)
       └── Each SteeringRule evaluates its conditions

3. Condition matches
   └── Rule generates reminder message
       └── Rule emits steering.reminder hook
           └── AgentAdapter.sendMessage() delivers to agent

4. Agent stops
   └── AgentAdapter calls rule.dispose()
       └── Rules unsubscribe from all hooks
```

### Evaluation Flow

```
┌──────────────────────────────────────────────────────────┐
│                    SteeringRule.evaluate()               │
│                                                          │
│  1. Check `once` ─────► Already fired? Skip              │
│                                                          │
│  2. Check cooldown ───► Too recent? Skip                 │
│                                                          │
│  3. Check blocked ────► Issue status = "blocked"? Skip   │
│                                                          │
│  4. Check status[] ───► Status not in list? Skip         │
│                                                          │
│  5. Check source[] ───► Source not in list? Skip         │
│                                                          │
│  6. Check hook[] ─────► Required hooks not fired? Skip   │
│                                                          │
│  7. Build context ────► Fetch notifications, toolHistory │
│                                                          │
│  8. Call when(ctx) ───► Returns false? Skip              │
│                                                          │
│  9. Generate reminder → Emit steering.reminder           │
└──────────────────────────────────────────────────────────┘
```

---

## Creating Steering Rules

### Basic Rule

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "my-reminder",
  name: "My Reminder",
  description: "Reminds agents about something",
  
  condition: {},  // Empty = always evaluate when idle
  
  reminder: "Check your notifications for updates.",
});
```

### Rule with Static Filters

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "review-reminder",
  name: "PR Review Reminder",
  description: "Reminds agents to check PR reviews",
  
  condition: {
    // Only when status is "in_review"
    status: ["in_review"],
    
    // Only for GitHub-sourced issues
    source: ["github"],
    
    // Only after agent.idle has fired
    hook: ["agent.idle"],
  },
  
  reminder: "You have a PR awaiting review. Check for new comments.",
  
  priority: 10,   // Lower = higher priority (0 is highest)
  once: false,    // Can fire multiple times
});
```

### Rule with Dynamic Condition

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "unread-comments",
  name: "Unread Comments Check",
  description: "Reminds about unread Jira comments",
  
  condition: {
    status: ["implementing"],
    
    when: async (ctx) => {
      // Only fire if there are unread Jira notifications
      return ctx.notifications.some(n => 
        n.source === "jira" && 
        n.status === "unread"
      );
    },
  },
  
  reminder: async (ctx) => {
    const comments = ctx.notifications.filter(n => n.source === "jira");
    return `You have ${comments.length} unread Jira comment(s). ` +
           `Please review and acknowledge them.`;
  },
});
```

### Rule with Tool History Check

```typescript
ctx.orchestrator.registerSteeringRule({
  id: "screenshot-reminder",
  name: "Screenshot Reminder",
  description: "Reminds to take screenshots before PR",
  
  condition: {
    status: ["implementing"],
    
    when: async (ctx) => {
      // Has used playwright tools but not taken screenshots recently
      const hasPlaywright = ctx.toolHistory.some(t => 
        t.name.startsWith("playwright_")
      );
      const hasScreenshot = ctx.toolHistory.some(t => 
        t.name === "playwright_screenshot" &&
        Date.now() - t.timestamp < 300000  // Last 5 minutes
      );
      
      return hasPlaywright && !hasScreenshot;
    },
  },
  
  reminder: "You've been using the browser. Consider capturing screenshots for documentation.",
  
  once: true,
});
```

---

## Condition Filters

### Status Filter

Restrict rule to specific issue statuses:

```typescript
condition: {
  // Single status
  status: ["implementing"],
  
  // Multiple statuses
  status: ["planning", "implementing"],
  
  // Any status (omit or empty array)
  status: [],
}
```

Available statuses:
- `pending`
- `queued`
- `planning`
- `implementing`
- `blocked` (never reminded)
- `in_review`
- `done`

### Source Filter

Restrict rule to specific issue sources:

```typescript
condition: {
  // Only Jira issues
  source: ["jira"],
  
  // Jira or GitHub
  source: ["jira", "github"],
  
  // Any source
  source: [],
}
```

### Hook Filter

Require specific hooks to have fired before evaluation:

```typescript
condition: {
  // Require agent to have gone idle
  hook: ["agent.idle"],
  
  // Require status change OR tool call
  hook: ["issue.status_changed", "agent.tool_call"],
  
  // Custom plugin hooks
  hook: ["github:pr.reviewed", "jira:comment.added"],
}
```

### Custom When Function

Full control over condition evaluation:

```typescript
condition: {
  when: async (ctx: SteeringContext) => {
    // ctx.issue - The current issue
    // ctx.notifications - Unread notifications
    // ctx.toolHistory - History of tool calls
    
    // Example: Only fire if agent has made progress
    const hasFileChanges = ctx.toolHistory.some(t => 
      t.name === "edit" || t.name === "write"
    );
    
    // Example: Only fire during business hours
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour <= 17;
    
    return hasFileChanges && isBusinessHours;
  },
}
```

---

## Reminder Functions

### Static String

```typescript
reminder: "Check your notifications for updates.",
```

### Dynamic Function

```typescript
reminder: async (ctx: SteeringContext) => {
  const { issue, notifications, toolHistory } = ctx;
  
  // Build contextual message
  let message = `Status update for ${issue.externalId}:\n`;
  
  if (notifications.length > 0) {
    message += `- ${notifications.length} unread notification(s)\n`;
  }
  
  const recentTools = toolHistory
    .filter(t => Date.now() - t.timestamp < 600000)
    .map(t => t.name);
  
  if (recentTools.length > 0) {
    message += `- Recent tools: ${recentTools.join(", ")}\n`;
  }
  
  message += "\nPlease review and take appropriate action.";
  
  return message;
}
```

### Conditional Message

```typescript
reminder: async (ctx) => {
  const jiraNotifs = ctx.notifications.filter(n => n.source === "jira");
  const githubNotifs = ctx.notifications.filter(n => n.source === "github");
  
  const parts = [];
  
  if (jiraNotifs.length > 0) {
    parts.push(`${jiraNotifs.length} Jira comment(s)`);
  }
  
  if (githubNotifs.length > 0) {
    parts.push(`${githubNotifs.length} GitHub notification(s)`);
  }
  
  if (parts.length === 0) {
    return "Time to check on your progress.";
  }
  
  return `You have ${parts.join(" and ")}. Please review.`;
}
```

---

## Configuration

### Global Steering Config

```toml
# ~/.jiratown.toml

[steering]
enabled = true        # Enable/disable all steering
debounce_ms = 2000    # Wait before evaluating after idle
max_reminders = 3     # Max reminders per rule (not enforced yet)
cooldown_ms = 30000   # Min time between reminders from same rule
```

### Per-Rule Settings

```typescript
{
  id: "my-rule",
  name: "My Rule",
  description: "...",
  
  condition: { ... },
  reminder: "...",
  
  // Priority (lower = higher priority)
  priority: 0,  // Highest priority
  priority: 50, // Medium priority (default)
  priority: 100, // Low priority
  
  // Once-only (fires once per agent session)
  once: true,
  once: false, // Can fire multiple times (default)
}
```

---

## Built-in Rules

### Jira Plugin

| Rule | Trigger | Message |
|------|---------|---------|
| `jira-comment-response` | Idle + unread Jira comments | Reminds to check comments |
| `jira-status-sync` | Status change | Reminds to sync with Jira |

### GitHub Plugin

| Rule | Trigger | Message |
|------|---------|---------|
| `github-pr-review` | `in_review` + GitHub notifications | Reminds to address feedback |
| `github-ci-failure` | Idle + CI failure notifications | Reminds to fix failing tests |

### Playwright Plugin

| Rule | Trigger | Message |
|------|---------|---------|
| `playwright-screenshot` | `implementing` + browser usage | Reminds to capture screenshots |

---

## Debugging

### Enable Debug Logging

```typescript
ctx.hooks.on("steering.reminder", ({ issueId, reminder }) => {
  console.log(`[STEERING] ${issueId}: ${reminder.substring(0, 100)}...`);
});

ctx.hooks.on("agent.idle", ({ issueId }) => {
  console.log(`[STEERING] Agent idle: ${issueId}`);
});
```

### Check Rule State

```typescript
// In plugin setup
const rules: SteeringRule[] = [];

ctx.hooks.on("agent.create.post", ({ adapter }) => {
  // Get rules from adapter (if accessible)
  // Log their state
});
```

### Common Issues

#### Rule Never Fires

1. Check `once: true` — may have already fired
2. Check cooldown — may be too recent
3. Check status filter — agent may not be in expected status
4. Check hook filter — required hooks may not have fired
5. Check `when()` — custom condition may be returning false

#### Rule Fires Too Often

1. Increase `cooldown_ms` in config
2. Set `once: true` for one-time reminders
3. Add more restrictive conditions

#### Rule Fires for Wrong Issues

1. Check `source` filter
2. Check `status` filter
3. Add `when()` condition to filter by issue properties

---

## Best Practices

### 1. Be Specific with Conditions

```typescript
// ❌ Too broad
condition: {},

// ✅ Specific
condition: {
  status: ["implementing"],
  source: ["jira"],
  hook: ["agent.idle"],
  when: async (ctx) => ctx.notifications.length > 0,
}
```

### 2. Use Once for One-Time Reminders

```typescript
// ✅ Initial guidance (once per session)
{
  id: "initial-guidance",
  reminder: "Remember to run tests before creating a PR.",
  once: true,
}

// ✅ Recurring check (can fire multiple times)
{
  id: "notification-check",
  reminder: "You have new notifications.",
  once: false,
}
```

### 3. Provide Actionable Messages

```typescript
// ❌ Vague
reminder: "Check something.",

// ✅ Actionable
reminder: async (ctx) => {
  const comments = ctx.notifications.filter(n => n.source === "jira");
  return `You have ${comments.length} Jira comment(s). ` +
         `Use \`jira_get_comments\` to review them, then ` +
         `\`jiratown_acknowledge\` to mark as read.`;
}
```

### 4. Set Appropriate Priority

```typescript
// High priority (urgent)
{ priority: 0 }   // Blocking issues, failures

// Medium priority (default)
{ priority: 50 }  // General reminders

// Low priority (informational)
{ priority: 100 } // Tips, suggestions
```

### 5. Use Tool History Wisely

```typescript
condition: {
  when: async (ctx) => {
    // Check if agent has used specific tools
    const hasEdited = ctx.toolHistory.some(t => t.name === "edit");
    
    // Check recent activity (last 5 minutes)
    const recentCalls = ctx.toolHistory.filter(
      t => Date.now() - t.timestamp < 300000
    );
    
    // Avoid reminding if agent is actively working
    return hasEdited && recentCalls.length === 0;
  },
}
```

### 6. Handle Edge Cases

```typescript
condition: {
  when: async (ctx) => {
    // Skip if no notifications
    if (ctx.notifications.length === 0) return false;
    
    // Skip if all notifications are acknowledged
    const unacked = ctx.notifications.filter(
      n => n.status !== "acknowledged"
    );
    if (unacked.length === 0) return false;
    
    // Skip if agent just made a tool call (still working)
    const lastCall = ctx.toolHistory[ctx.toolHistory.length - 1];
    if (lastCall && Date.now() - lastCall.timestamp < 10000) {
      return false;
    }
    
    return true;
  },
}
```

### 7. Document Your Rules

```typescript
/**
 * PR Review Reminder
 * 
 * Triggers when:
 * - Issue status is "in_review"
 * - Agent is idle
 * - There are unread GitHub review notifications
 * 
 * Action: Reminds agent to address review feedback
 */
ctx.orchestrator.registerSteeringRule({
  id: "pr-review-reminder",
  name: "PR Review Reminder",
  description: "Reminds agents to check PR reviews when idle",
  // ...
});
```
