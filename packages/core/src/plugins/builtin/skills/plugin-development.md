# Plugin Development Guide

This skill teaches you how to create Workhorse plugins.

## Plugin Structure

A plugin is created using `definePlugin()`:

```typescript
import { definePlugin, useWorkhorse } from "workhorse-core";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
  },
  setup() {
    const { hooks } = useWorkhorse();
    console.log("Plugin initialized");
  },
  teardown() {
    console.log("Plugin cleaned up");
  },
});
```

## Plugin with Config Schema

Use Zod for typed configuration:

```typescript
import { definePlugin, useWorkhorse } from "workhorse-core";
import { z } from "zod/v4";

export const MyConfigSchema = z.object({
  apiKey: z.string(),
  timeout: z.number().default(5000),
  enabled: z.boolean().default(true),
});

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },
  configSchema: MyConfigSchema,
  setup(config) {
    // config is typed as z.infer<typeof MyConfigSchema>
    console.log("API Key:", config.apiKey);
  },
});
```

Config is defined in `.workhorse.toml`:

```toml
[plugins.my-plugin]
api_key = "secret"
timeout = 10000
```

> Note: TOML uses snake_case, but config is converted to camelCase in TypeScript.

## Accessing Services

Use `useWorkhorse()` inside `setup()`:

```typescript
setup(config) {
  const {
    hooks,         // Event emitter
    db,            // Database instance
    memory,        // MemoryService (L1 + L2 + notifications)
    monitors,      // MonitorService
    tracker,       // Tracker (issue parsing)
    orchestrator,  // HarnessOrchestrator
    config: appConfig, // Full app config
    paths,         // Config paths
  } = useWorkhorse();
}
```

## Plugin Capabilities

### 1. Register Issue Parsers

Parse custom issue formats (URLs, keys):

```typescript
tracker.registerParser({
  source: "my-service",
  canParse: (input) => input.startsWith("MY-") || input.includes("my-service.com"),
  parse: async (input) => ({
    externalId: extractKey(input),
    source: "my-service",
    title: "Issue from My Service",
    description: "...",
    issueType: "task",
    url: `https://my-service.com/issues/${extractKey(input)}`,
    metadata: {},
  }),
});
```

### 2. Add Prompt Context

Inject context blocks into agent prompts:

```typescript
hooks.on("prompt.building", ({ issueId, context }) => {
  context.contextBlocks.push({
    id: "my-context",
    title: "My Context",
    content: "Additional context for the agent",
    priority: 50, // Lower = earlier in prompt
  });
});
```

### 3. Register Monitors

Poll external services for changes:

```typescript
monitors.registerMonitor({
  id: "my-poll",
  type: "remote",
  interval: 60000,
  poll: async (ctx) => {
    const updates = await fetchUpdates(ctx.issueId);
    return { hasChanges: updates.length > 0, data: updates };
  },
});

// Start/stop per issue
hooks.on("agent.create.post", ({ adapter }) => {
  monitors.startMonitor("my-poll", adapter.issueId);
});
hooks.on("agent.stop.post", ({ adapter }) => {
  monitors.stopMonitor("my-poll", adapter.issueId);
});
```

### 4. Register Tools

Add functions agents can invoke:

```typescript
import type { OrchestratorTool, ToolExecutionContext, ToolResult } from "workhorse-core";

const myTool: OrchestratorTool = {
  name: "my_action",
  description: "Perform an action",
  schema: {
    type: "object",
    properties: {
      target: { type: "string", description: "Target resource" },
    },
    required: ["target"],
  },
  execute: async (args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> => {
    const { target } = args as { target: string };
    try {
      const result = await performAction(target);
      return { success: true, output: `Action completed on ${target}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

orchestrator.registerTool(myTool);
```

### 5. Register Agent Adapters

Add support for a new AI harness:

```typescript
import { AgentAdapter } from "workhorse-core";

class MyHarnessAdapter extends AgentAdapter {
  override readonly harness = "my-harness";
  static override readonly displayName = "My Harness";
  static override readonly icon = "🔧";

  protected override async doStart(): Promise<void> {
    // Start harness session
  }

  override async sendMessage(content: string): Promise<void> {
    // Send message to harness
  }

  protected override async doStop(): Promise<void> {
    // Cleanup
  }

  override isRunning(): boolean {
    return /* check if active */;
  }
}

orchestrator.registerAdapter("my-harness", MyHarnessAdapter);
```

### 6. Register Steering Rules

Add autonomous behavior rules:

```typescript
orchestrator.registerSteeringRule({
  id: "my-reminder",
  name: "My Reminder",
  description: "Reminds agents when idle",
  condition: {
    status: ["implementing"],
    when: async (ctx) => ctx.notifications.length > 0,
  },
  reminder: "Check your notifications!",
  priority: 10,
  once: true,
});
```

### 7. Create Notifications

Push notifications to agent inboxes:

```typescript
await memory.notifications.create({
  issueId: "issue-internal-id",
  source: "my-service",
  sourceId: "update-456", // Dedup key
  title: "Configuration changed",
  body: "Please review the changes.",
  priority: "high", // "blocking" | "high" | "normal" | "low"
  metadata: { changedBy: "john.doe" },
});
```

### 8. Listen to Hooks

React to system events. See the **Hooks Reference** section below for all available hooks.

```typescript
hooks.on("agent.create.post", ({ adapter }) => {
  console.log(`Agent created for ${adapter.issueId}`);
});

hooks.on("issue.status_changed", ({ issue, from, to }) => {
  console.log(`${issue.externalId}: ${from} → ${to}`);
});

hooks.on("notification.created", ({ notification, issueId }) => {
  console.log(`New notification for ${issueId}: ${notification.title}`);
});
```

## Cross-Plugin Communication

Plugins communicate via hooks:

```typescript
// Plugin A: Emit custom events
hooks.emit("my-plugin:data_ready", { data: myData });

// Plugin B: Listen
hooks.on("my-plugin:data_ready", ({ data }) => {
  // Use data from Plugin A
});
```

## Adding a New Plugin Package

1. Create directory: `packages/plugins/<name>/`
2. Add `package.json` with name `workhorse-plugin-<name>`
3. Create `src/index.ts` with `definePlugin()`
4. Register after bootstrap:

```typescript
import myPlugin from "workhorse-plugin-my-plugin";

const jt = await bootstrap({
  plugins: [myPlugin],
});
```

5. Add config to `.workhorse.toml`:

```toml
[plugins.my-plugin]
api_key = "secret"
```
