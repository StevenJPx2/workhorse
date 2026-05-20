# monitor

Polling and event framework for Workhorse. Core provides the infrastructure, plugins bring the "what" to monitor.

## Overview

MonitorService manages both **polling** (periodic checks) and **event-driven** (push-based) monitoring for external changes (Jira comments, GitHub reviews, Slack messages) and local checks (agent health).

**Two monitor types:**

- `PollingMonitor` — Calls `poll()` at a fixed interval (for APIs without webhooks)
- `EventMonitor` — Sets up a listener once, emits results as events occur (for WebSockets, webhooks)

**Two-phase API:**

1. `registerMonitor(options)` — Plugin registers a monitor definition once at startup
2. `startMonitor(id, issueId)` — Start the registered monitor for a specific issue (e.g., from a hook)

Each monitor owns its state, error counting, and cleanup. `MonitorService` tracks registered definitions and running instances.

## Usage

### Registering a Polling Monitor

```typescript
// Register once at plugin initialization
ctx.monitors.registerMonitor({
  id: "jira-comments",
  type: "polling",
  interval: 30_000,
  async poll(ctx) {
    // ctx contains: issueId, hooks, memory, config
    const comments = await fetchNewComments(ctx.issueId);
    return { hasChanges: comments.length > 0, data: comments };
  },
});
```

### Registering an Event Monitor

```typescript
// For WebSockets, webhooks, file watchers, etc.
ctx.monitors.registerMonitor({
  id: "slack-events",
  type: "event",
  async setup(ctx, emit) {
    const socket = connectToSlack(config.botToken);

    socket.on("message", (msg) => {
      if (!isTrackedThread(ctx.issueId, msg.thread_ts)) return;
      emit({ hasChanges: true, data: msg });
    });

    socket.on("error", (err) => {
      // Errors are tracked; monitor self-stops after 5 consecutive errors
    });

    await socket.connect();

    // Return cleanup function
    return () => socket.disconnect();
  },
});
```

### Starting a Monitor (from a hook)

```typescript
// Start for a specific issue when an agent starts
ctx.hooks.on("agent.started", async ({ instance }) => {
  await ctx.monitors.startMonitor("jira-comments", instance.issueId);
  await ctx.monitors.startMonitor("slack-events", instance.issueId);
});
```

### Stopping Monitors

```typescript
// Stop all monitors for an issue (e.g. when agent stops)
await monitorService.stopMonitors("AM-123");

// Stop a specific monitor by id
await monitorService.stopMonitor("AM-123", "jira-comments");
```

### Responding to Monitor Events

Both polling and event monitors emit the same hooks:

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

| Event                | Payload                              | When                                  |
| -------------------- | ------------------------------------ | ------------------------------------- |
| `monitor.registered` | `{ name, type }`                     | `registerMonitor()` is called         |
| `monitor.tick`       | `{ id, issueId, result }`            | Poll/event returns `hasChanges: true` |
| `monitor.error`      | `{ id, issueId, error, errorCount }` | Poll/setup/event throws an error      |

## Error Handling

Both monitor types self-stop after 5 consecutive errors (`state` transitions to `"error"`). The error count resets on a successful poll or event. `getRunningMonitors()` auto-purges self-stopped monitors from the map.

For event monitors, plugins can optionally call `monitor.reportError(err)` from their error handlers to integrate with the error tracking system.

## Architecture

```
BaseMonitor (abstract)
├── PollingMonitor — interval + poll()
└── EventMonitor — setup() + emit + cleanup
```

Both share:

- State management (`status.state`, `status.errorCount`)
- Hook emission (`monitor.tick`, `monitor.error`)
- Auto-stop on error threshold

## Built-in Monitors

### Agent Health (`health.ts`)

Stub implementation for checking if the agent process is alive. Started by Harness during agent spawn. Full implementation pending Harness (Step 9).

```typescript
import { createAgentHealthMonitor } from "#services/monitor";

// Register once
ctx.monitors.registerMonitor(
  createAgentHealthMonitor({
    interval: config.behavior.pollInterval,
    port: 3000,
    pid: 12345,
  }),
);

// Start for an issue
await ctx.monitors.startMonitor("agent-health", issueId);
```

## Files

| File                 | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `types.ts`           | Domain types (`MonitorOptions`, `MonitorResult`, `MonitorContext`, etc.) |
| `base-monitor.ts`    | `BaseMonitor` abstract class — shared state and error handling           |
| `polling-monitor.ts` | `PollingMonitor` — interval-based polling                                |
| `event-monitor.ts`   | `EventMonitor` — event-driven with setup/cleanup                         |
| `service.ts`         | `MonitorService` — registry + running instance map                       |
| `health.ts`          | Agent health monitor factory (stub)                                      |
| `index.ts`           | Barrel exports                                                           |

## When to Use Which

| Scenario                               | Monitor Type |
| -------------------------------------- | ------------ |
| Jira comments (no webhooks configured) | `polling`    |
| GitHub PR status                       | `polling`    |
| Slack Socket Mode                      | `event`      |
| GitHub webhooks                        | `event`      |
| File watcher                           | `event`      |
| Agent health check                     | `polling`    |
