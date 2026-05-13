# monitor

Polling framework for Workhorse. Core provides the infrastructure, plugins bring the "what" to monitor.

## Overview

MonitorService manages periodic polling for external changes (Jira comments, GitHub reviews, etc.) and local checks (agent health).

**Two-phase API:**
1. `registerMonitor(options)` — Plugin registers a monitor definition once at startup
2. `startMonitor(id, issueId)` — Start the registered monitor for a specific issue (e.g., from a hook)

Each `Monitor` owns its own poll loop, scheduling, error counting, and status. `MonitorService` tracks registered definitions and running instances.

## Usage

### Registering a Monitor (in a plugin's setup)

```typescript
// Register once at plugin initialization
ctx.monitors.registerMonitor({
  id: "jira-comments",
  type: "remote",
  interval: 30_000,
  async poll(ctx) {
    // ctx contains: issueId, hooks, memory, config
    const comments = await fetchNewComments(ctx.issueId);
    return { hasChanges: comments.length > 0, data: comments };
  },
});
```

### Starting a Monitor (from a hook)

```typescript
// Start for a specific issue when an agent starts
ctx.hooks.on("agent.started", ({ instance }) => {
  ctx.monitors.startMonitor("jira-comments", instance.issueId);
});
```

### Stopping Monitors

```typescript
// Stop all monitors for an issue (e.g. when agent stops)
monitorService.stopMonitors("AM-123");

// Stop a specific monitor by id
monitorService.stopMonitor("AM-123", "jira-comments");
```

### Responding to Monitor Events

```typescript
hooks.on("monitor.tick", ({ id, issueId, result }) => {
  if (id === "jira-comments") {
    harness.sendMessage(issueId, formatComments(result));
  }
});

hooks.on("monitor.error", ({ id, issueId, error, errorCount }) => {
  console.error(`Monitor ${id} failed for ${issueId}: ${error.message}`);
});
```

## Hooks

| Event | Payload | When |
|-------|---------|------|
| `monitor.registered` | `{ name, type }` | `registerMonitor()` is called |
| `monitor.tick` | `{ id, issueId, result }` | Poll returns `hasChanges: true` |
| `monitor.error` | `{ id, issueId, error, errorCount }` | Poll throws an error |

## Error Handling

Monitors self-stop after 5 consecutive errors (`state` transitions to `"error"`). The error count resets on a successful poll. `getRunningMonitors()` auto-purges self-stopped monitors from the map.

## Built-in Monitors

### Agent Health (`health.ts`)

Stub implementation for checking if the agent process is alive. Started by Harness during agent spawn. Full implementation pending Harness (Step 9).

```typescript
import { createAgentHealthMonitor } from "#services/monitor";

// Register once
ctx.monitors.registerMonitor(createAgentHealthMonitor({
  interval: config.behavior.pollInterval,
  port: 3000,
  pid: 12345,
}));

// Start for an issue
ctx.monitors.startMonitor("agent-health", issueId);
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | Domain types (`MonitorOptions`, `MonitorResult`, `MonitorContext`, etc.) |
| `monitor.ts` | `Monitor` class — self-managing poll loop |
| `service.ts` | `MonitorService` — registry + running instance map |
| `health.ts` | Agent health monitor factory (stub) |
| `index.ts` | Barrel exports |
