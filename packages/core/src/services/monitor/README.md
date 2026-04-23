# monitor

Polling framework for Jiratown. Core provides the infrastructure, plugins bring the "what" to monitor.

## Overview

MonitorService manages periodic polling for external changes (Jira comments, GitHub reviews, etc.) and local checks (agent health). Callers construct `Monitor` instances and start them per-issue via `startMonitor()`.

Each `Monitor` owns its own poll loop, scheduling, error counting, and status. `MonitorService` is a thin map that tracks running monitors and stops them on request.

## Usage

### Starting a Monitor (in a plugin or Harness)

```typescript
hooks.on("agent.started", ({ instance }) => {
  monitorService.startMonitor(
    instance.issueId,
    ctx,
    new Monitor({
      name: "jira-comments",
      type: "remote",
      interval: 30_000,
      async poll(ctx) {
        const comments = await fetchNewComments(ctx.issueId);
        return { hasChanges: comments.length > 0, data: comments };
      },
    }),
  );
});
```

### Stopping Monitors

```typescript
// Stop all monitors for an issue (e.g. when agent stops)
monitorService.stopMonitors("AM-123");

// Stop a specific monitor by name
monitorService.stopMonitor("AM-123", "jira-comments");
```

### Responding to Monitor Events

```typescript
hooks.on("monitor.tick", ({ name, issueId, result }) => {
  if (name === "jira-comments") {
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
| `monitor.registered` | `{ name, type }` | `startMonitor()` is called |
| `monitor.tick` | `{ name, issueId, result }` | Poll returns `hasChanges: true` |
| `monitor.error` | `{ name, issueId, error, errorCount }` | Poll throws an error |

## Error Handling

Monitors self-stop after 5 consecutive errors (`state` transitions to `"error"`). The error count resets on a successful poll. `getRunningMonitors()` auto-purges self-stopped monitors from the map.

## Built-in Monitors

### Agent Health (`health.ts`)

Stub implementation for checking if the agent process is alive. Started by Harness during agent spawn. Full implementation pending Harness (Step 9).

```typescript
import { createAgentHealthMonitor } from "#services/monitor";

monitorService.startMonitor(
  issueId,
  ctx,
  createAgentHealthMonitor({
    interval: config.behavior.pollInterval,
    port: 3000,
    pid: 12345,
  }),
);
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | `Monitor` class + domain types (`MonitorOptions`, `MonitorResult`, etc.) |
| `service.ts` | `MonitorService` — thin map of running monitors |
| `health.ts` | Agent health monitor factory (stub) |
| `index.ts` | Barrel exports |
