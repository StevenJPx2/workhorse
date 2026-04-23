# monitor

Polling framework for Jiratown. Core provides the infrastructure, plugins bring the "what" to monitor.

## Overview

MonitorService manages periodic polling for external changes (Jira comments, GitHub reviews, etc.) and local checks (agent health). Plugins register monitor factories during setup, which are invoked when monitoring starts for a specific issue.

## Usage

### Registering a Monitor (in a plugin)

```typescript
export default definePlugin({
  manifest: { name: "jira", version: "1.0.0" },
  setup(ctx) {
    // Register a monitor factory
    ctx.monitors.registerMonitor("jira-comments", (monitorCtx) => ({
      name: "jira-comments",
      type: "remote",
      interval: 30000, // 30 seconds
      async poll() {
        const comments = await fetchNewComments(monitorCtx.issueId);
        return {
          hasChanges: comments.length > 0,
          data: comments,
        };
      },
    }));
  },
});
```

### Starting/Stopping Monitors (by Harness)

```typescript
// When agent spawns
monitors.startMonitors("AM-123", {
  issueId: "AM-123",
  hooks,
  memory,
  config,
});

// When agent stops
monitors.stopMonitors("AM-123");
```

### Responding to Monitor Events

```typescript
hooks.on("monitor.tick", ({ name, issueId, result }) => {
  if (name === "jira-comments") {
    // Push notification to agent
    harness.sendMessage(issueId, formatComments(result));
  }
});

hooks.on("monitor.error", ({ name, issueId, error, errorCount }) => {
  console.error(`Monitor ${name} failed for ${issueId}: ${error.message}`);
});
```

## Hooks

| Event | Payload | When |
|-------|---------|------|
| `monitor.registered` | `{ name, type }` | Monitor factory is invoked |
| `monitor.tick` | `{ name, issueId, result }` | Poll returns `hasChanges: true` |
| `monitor.error` | `{ name, issueId, error, errorCount }` | Poll throws an error |

## Error Handling

Monitors are stopped after 5 consecutive errors. The error count resets on successful poll.

## Built-in Monitors

### Agent Health (`health.ts`)

Stub implementation for checking if the agent process is alive. Registered by Harness during agent spawn. Full implementation pending Harness (Step 9).

```typescript
import { createAgentHealthMonitor } from "#services/monitor";

monitors.registerMonitor(
  "agent-health",
  createAgentHealthMonitor({ port: 3000, pid: 12345 }),
);
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | Domain types (Monitor, MonitorFactory, etc.) |
| `service.ts` | MonitorService class |
| `health.ts` | Agent health monitor factory (stub) |
| `index.ts` | Barrel exports |
