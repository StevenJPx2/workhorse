# Jiratown Plugin Guide

Plugins extend Jiratown's functionality. This guide covers everything you need to create a plugin.

## Basic Plugin

```typescript
import { definePlugin } from "@jiratown/core";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
  },
  setup() {
    console.log("Plugin initialized");
  },
  teardown() {
    console.log("Plugin cleaned up");
  },
});
```

## Plugin with Config Schema

```typescript
import { definePlugin, useJiratown } from "@jiratown/core";
import { z } from "zod/v4";

export const MyConfigSchema = z.object({
  apiKey: z.string(),
  timeout: z.number().default(5000),
  enabled: z.boolean().default(true),
});

export type MyConfig = z.infer<typeof MyConfigSchema>;

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },
  configSchema: MyConfigSchema,
  setup(config) {
    // config is typed as MyConfig
    console.log("API Key:", config.apiKey);
    console.log("Timeout:", config.timeout);
  },
});
```

Config is defined in the main config file:

```toml
[plugins.my-plugin]
api_key = "secret"
timeout = 10000
```

> Note: TOML uses snake_case, but config is converted to camelCase in TypeScript.

## Accessing Services

Use `useJiratown()` inside `setup()` to access services:

```typescript
setup(config) {
  const {
    hooks,        // Event emitter
    db,           // Database instance
    memory,       // MemoryService (L1 + L2 + notifications)
    monitors,     // MonitorService
    tracker,      // Tracker (issue parsing)
    orchestrator, // HarnessOrchestrator
    config: appConfig, // Full app config
    paths,        // Config paths
  } = useJiratown();
}
```

## Plugin Capabilities

### 1. Register Issue Parsers

Parse custom issue formats (URLs, keys):

```typescript
setup(config) {
  const { tracker } = useJiratown();
  
  tracker.registerParser({
    name: "my-service",
    canParse: (input) => input.startsWith("MY-"),
    parse: async (input) => ({
      source: "my-service",
      type: "task",
      key: input,
      title: "...",
      description: "...",
    }),
  });
}
```

### 2. Add Prompt Context

Inject context into agent prompts:

```typescript
setup(config) {
  const { hooks } = useJiratown();
  
  hooks.on("prompt:building", (context) => {
    context.blocks.push({
      title: "My Service Status",
      content: "Current status: OK",
      priority: 50, // Higher = appears first
    });
  });
}
```

### 3. Register Monitors

Poll external services:

```typescript
setup(config) {
  const { monitors, hooks } = useJiratown();
  
  monitors.registerMonitor({
    id: "my-service-poll",
    issueId: null, // Global monitor (not issue-specific)
    interval: 60000, // 1 minute
    poll: async (context) => {
      const updates = await fetchUpdates();
      
      if (updates.length > 0) {
        hooks.emit("my-service:updates", { updates });
      }
      
      return { status: "ok", data: { count: updates.length } };
    },
  });
  
  // Start on agent spawn
  hooks.on("agent:started", ({ issueId }) => {
    monitors.startMonitor("my-service-poll", issueId);
  });
}
```

### 4. Register Tools

Add tools that agents can call:

```typescript
setup(config) {
  const { orchestrator } = useJiratown();
  
  orchestrator.registerTool({
    name: "my_service_action",
    description: "Perform an action in My Service",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action to perform" },
        target: { type: "string", description: "Target resource" },
      },
      required: ["action", "target"],
    },
    execute: async (params, context) => {
      const result = await performAction(params.action, params.target);
      
      return {
        success: true,
        message: `Action ${params.action} completed`,
        data: result,
      };
    },
  });
}
```

### 5. Register Agent Adapters

Add support for a new AI harness:

```typescript
import { AgentAdapter, definePlugin } from "@jiratown/core";

class MyHarnessAdapter extends AgentAdapter {
  async doStart(): Promise<void> {
    // Initialize and start the AI agent
  }
  
  async sendMessage(message: string): Promise<void> {
    // Send message to running agent
  }
  
  async doStop(): Promise<void> {
    // Stop the agent
  }
  
  isRunning(): boolean {
    return this._running;
  }
}

export default definePlugin({
  manifest: { name: "my-harness", version: "1.0.0" },
  setup() {
    const { orchestrator } = useJiratown();
    orchestrator.registerAdapter("my-harness", MyHarnessAdapter);
  },
});
```

### 6. Register Steering Rules

Add autonomous behavior rules:

```typescript
import { SteeringRule, definePlugin } from "@jiratown/core";

export default definePlugin({
  manifest: { name: "my-steering", version: "1.0.0" },
  setup() {
    const { orchestrator, hooks } = useJiratown();
    
    orchestrator.registerSteeringRule(
      new SteeringRule({
        name: "my-reminder",
        condition: {
          event: "agent:idle",
          minInterval: 300000, // 5 min debounce
        },
        action: async (event, issue) => {
          hooks.emit("agent:message", {
            issueId: issue.id,
            message: "Remember to check for updates!",
          });
        },
      }, hooks)
    );
  },
});
```

### 7. Listen to Hooks

React to system events:

```typescript
setup(config) {
  const { hooks } = useJiratown();
  
  // Agent lifecycle
  hooks.on("agent:started", ({ issueId }) => { /* ... */ });
  hooks.on("agent:stopped", ({ issueId, reason }) => { /* ... */ });
  hooks.on("agent:idle", ({ issueId }) => { /* ... */ });
  
  // Issue events
  hooks.on("issue:status_changed", ({ issueId, from, to }) => { /* ... */ });
  
  // PR events
  hooks.on("pr:opened", ({ issueId, prUrl }) => { /* ... */ });
  hooks.on("pr:merged", ({ issueId, prUrl }) => { /* ... */ });
  hooks.on("pr:review_requested", ({ issueId, reviewer }) => { /* ... */ });
  
  // Notifications
  hooks.on("notification:created", ({ notification }) => { /* ... */ });
}
```

### 8. Create Notifications

Push notifications to agents:

```typescript
setup(config) {
  const { memory, hooks } = useJiratown();
  
  hooks.on("my-service:alert", async ({ issueId, alert }) => {
    await memory.notifications.create({
      issueId,
      type: "my_service_alert",
      title: alert.title,
      body: alert.message,
      priority: alert.severity === "high" ? "high" : "normal",
      sourceId: `alert-${alert.id}`,
    });
  });
}
```

## Plugin Lifecycle

1. **Registration** — `plugins.register(myPlugin)` adds to registry
2. **Setup** — `plugins.setup()` calls each plugin's `setup(config)`
3. **Runtime** — Plugin hooks and tools are active
4. **Teardown** — `plugins.teardown()` or `jt.shutdown()` calls `teardown()`

### Error Handling

- Setup errors are logged but don't crash the app
- Each plugin runs in isolation
- Use try/catch for external API calls

```typescript
setup(config) {
  const { hooks } = useJiratown();
  
  hooks.on("some:event", async (payload) => {
    try {
      await externalApi.call(payload);
    } catch (error) {
      console.error("External API failed:", error);
      // Don't throw — other hooks should still run
    }
  });
}
```

## Cross-Plugin Communication

Plugins can communicate via hooks:

```typescript
// Plugin A: Emit custom events
hooks.emit("pluginA:data_ready", { data: myData });

// Plugin B: Listen to Plugin A
hooks.on("pluginA:data_ready", ({ data }) => {
  // Use data from Plugin A
});
```

## Example: Full Plugin

```typescript
import { definePlugin, useJiratown, SteeringRule } from "@jiratown/core";
import { z } from "zod/v4";

export const SlackConfigSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().default("#dev"),
  notifyOnPrMerge: z.boolean().default(true),
});

export default definePlugin({
  manifest: {
    name: "slack",
    version: "1.0.0",
    description: "Slack notifications for Jiratown events",
  },
  configSchema: SlackConfigSchema,
  
  setup(config) {
    const { hooks, orchestrator } = useJiratown();
    
    // Notify on PR merge
    if (config.notifyOnPrMerge) {
      hooks.on("pr:merged", async ({ issueId, prUrl }) => {
        await sendSlackMessage(config.webhookUrl, {
          channel: config.channel,
          text: `PR merged for issue ${issueId}: ${prUrl}`,
        });
      });
    }
    
    // Add tool for agents to send Slack messages
    orchestrator.registerTool({
      name: "send_slack_message",
      description: "Send a message to Slack",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          channel: { type: "string" },
        },
        required: ["message"],
      },
      execute: async (params) => {
        await sendSlackMessage(config.webhookUrl, {
          channel: params.channel || config.channel,
          text: params.message,
        });
        return { success: true, message: "Sent to Slack" };
      },
    });
  },
  
  teardown() {
    // Cleanup if needed
  },
});

async function sendSlackMessage(webhookUrl: string, payload: object) {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```
