# Jiratown Plugin Development Guide

This guide covers everything you need to create plugins for Jiratown.

## Table of Contents

1. [Plugin Basics](#plugin-basics)
2. [Plugin Structure](#plugin-structure)
3. [Configuration Schema](#configuration-schema)
4. [Accessing Services](#accessing-services)
5. [Registering Capabilities](#registering-capabilities)
6. [Hook-Based Communication](#hook-based-communication)
7. [Testing Plugins](#testing-plugins)
8. [Publishing Plugins](#publishing-plugins)
9. [Best Practices](#best-practices)

---

## Plugin Basics

### What is a Plugin?

A plugin extends Jiratown's functionality by:
- Registering issue parsers (for new sources like GitLab, Linear, etc.)
- Adding tools for agents to use
- Creating monitors for external services
- Defining steering rules for idle agents
- Injecting context into prompts
- Syncing status with external systems

### Minimal Plugin

```typescript
import { definePlugin, useJiratown } from "@jiratown/core";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
  },
  setup() {
    const { hooks } = useJiratown();
    console.log("Plugin initialized");
  },
  teardown() {
    console.log("Plugin cleaned up");
  },
});
```

---

## Plugin Structure

### Recommended Directory Layout

```
packages/plugins/my-plugin/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts           # Plugin definition and setup
│   ├── config.ts          # Config schema
│   ├── parser.ts          # Issue parser (if applicable)
│   ├── tools/             # Tool implementations
│   │   ├── index.ts
│   │   ├── my-action.ts
│   │   └── my-query.ts
│   ├── monitor.ts         # Monitor factory
│   ├── steering.ts        # Steering rules
│   ├── prompt.ts          # Prompt enrichment
│   ├── sync.ts            # Status sync
│   ├── hooks.ts           # Plugin-specific hooks
│   ├── client.ts          # External API client
│   ├── renderer.ts        # TUI renderer
│   └── types.ts           # Type definitions
└── __tests__/
    ├── index.test.ts
    └── tools.test.ts
```

### Package.json

```json
{
  "name": "@jiratown/plugin-my-plugin",
  "version": "0.1.0",
  "description": "My custom Jiratown plugin",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "peerDependencies": {
    "@jiratown/core": "^0.1.0"
  },
  "devDependencies": {
    "@jiratown/core": "workspace:*",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## Configuration Schema

### Using Zod for Validation

```typescript
// src/config.ts
import { z } from "zod/v4";

export const MyPluginConfigSchema = z.object({
  // Required fields
  apiKey: z.string().min(1, "API key is required"),
  baseUrl: z.string().url(),
  
  // Optional with defaults
  timeout: z.number().default(5000),
  retries: z.number().min(0).max(10).default(3),
  
  // Optional nullable
  webhookUrl: z.string().url().optional(),
  
  // Enums
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  
  // Complex nested objects
  auth: z.object({
    type: z.enum(["oauth", "api-key"]),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
  }).optional(),
});

export type MyPluginConfig = z.infer<typeof MyPluginConfigSchema>;
```

### Using Config in Plugin

```typescript
// src/index.ts
import { definePlugin, useJiratown } from "@jiratown/core";
import { MyPluginConfigSchema, type MyPluginConfig } from "./config";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },
  configSchema: MyPluginConfigSchema,
  
  setup(config: MyPluginConfig) {
    // config is validated and typed
    console.log("API Key:", config.apiKey);
    console.log("Timeout:", config.timeout);
    
    if (config.auth?.type === "oauth") {
      // TypeScript knows clientId might be undefined here
      console.log("Using OAuth with client:", config.auth.clientId);
    }
  },
});
```

### TOML Configuration

```toml
# ~/.jiratown.toml
[plugins.my-plugin]
api_key = "secret-key-123"
base_url = "https://api.example.com"
timeout = 10000
log_level = "debug"

[plugins.my-plugin.auth]
type = "oauth"
client_id = "my-client-id"
client_secret = "my-client-secret"
```

Note: TOML uses `snake_case`, but config is converted to `camelCase` in TypeScript.

---

## Accessing Services

### Available Services

```typescript
setup(config) {
  const {
    hooks,         // Event emitter (mitt)
    db,            // Database instance
    memory,        // MemoryService (L1 + L2 + notifications)
    monitors,      // MonitorService
    tracker,       // Tracker (issue parsing)
    orchestrator,  // HarnessOrchestrator
    config: appConfig, // Full app config
    paths,         // Resolved file paths
  } = useJiratown();
}
```

### Service APIs

#### Hooks

```typescript
// Subscribe to events
hooks.on("issue.status_changed", ({ issue, from, to }) => {
  console.log(`${issue.externalId}: ${from} → ${to}`);
});

// Emit custom events
hooks.emit("my-plugin:data_ready", { data: myData });

// One-time listener
hooks.once("agent.start.post", ({ adapter }) => {
  console.log("First agent started!");
});
```

#### Database

```typescript
// Issues
const issue = await db.issues.getByExternalId("PROJ-123", "jira");
await db.issues.updateStatus(issue.id, "implementing");

// Events
await db.events.insert({
  issueId: issue.id,
  type: "my-plugin-event",
  message: "Something happened",
  metadata: { key: "value" },
});

// Notifications
await db.notifications.create({
  issueId: issue.id,
  source: "my-plugin",
  sourceId: "unique-id-123",  // For deduplication
  priority: "high",
  title: "Alert",
  body: "Something needs attention",
});
```

#### Memory

```typescript
// L1 - Session memory
const ctx = memory.l1.get("issue-id");
if (ctx) {
  const session = await ctx.read();
  console.log("Patterns:", session.patterns);
}

// L2 - Semantic search
const results = await memory.l2.search("authentication flow", { limit: 5 });

// Notifications
const unread = await memory.notifications.getUnread("issue-id");
```

---

## Registering Capabilities

### 1. Issue Parsers

Parse ticket keys or URLs from external systems.

```typescript
setup(config) {
  const { tracker } = useJiratown();

  tracker.registerParser({
    source: "my-service",
    
    // Return true if this parser can handle the input
    canParse: (input) => {
      return input.startsWith("MY-") || 
             input.includes("my-service.com/issues/");
    },
    
    // Parse input and return issue data
    parse: async (input) => {
      const key = extractKey(input);
      const issue = await fetchFromMyService(key);
      
      return {
        externalId: issue.key,
        source: "my-service",
        title: issue.title,
        description: issue.description,
        issueType: mapIssueType(issue.type),
        url: `https://my-service.com/issues/${issue.key}`,
        assignee: issue.assignee?.name,
        labels: issue.labels,
        metadata: {
          priority: issue.priority,
          customField: issue.customField,
        },
      };
    },
  });
}
```

### 2. Tools

Add functions that agents can invoke.

```typescript
// src/tools/create-item.ts
import type { OrchestratorTool, ToolExecutionContext, ToolResult } from "@jiratown/core";

export const createItemTool: OrchestratorTool = {
  name: "my_plugin_create_item",
  description: "Create a new item in My Service",
  
  schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Item title",
      },
      description: {
        type: "string",
        description: "Item description",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Item priority",
      },
    },
    required: ["title"],
  },
  
  execute: async (args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> => {
    const { title, description, priority } = args as {
      title: string;
      description?: string;
      priority?: "low" | "medium" | "high";
    };

    try {
      // ctx provides: issueId, worktreePath, db, hooks, memory
      const item = await createItem({ title, description, priority });
      
      // Create notification about the action
      await ctx.memory.notifications.create({
        issueId: ctx.issueId,
        source: "my-plugin",
        sourceId: `item-created-${item.id}`,
        priority: "normal",
        title: "Item Created",
        body: `Created item: ${item.title}`,
      });
      
      return {
        success: true,
        output: `Created item ${item.id}: ${item.title}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// src/index.ts
import { createItemTool } from "./tools/create-item";

setup(config) {
  const { orchestrator } = useJiratown();
  orchestrator.registerTool(createItemTool);
}
```

### 3. Monitors

Poll external services for changes.

```typescript
// src/monitor.ts
import type { MonitorOptions } from "@jiratown/core";

export function createMyMonitor(config: MyPluginConfig): MonitorOptions {
  return {
    id: "my-service-updates",
    type: "remote",
    interval: config.pollInterval || 30000,
    
    poll: async (ctx) => {
      // ctx has: issueId, hooks, memory, config
      const updates = await fetchUpdates(ctx.issueId);
      
      if (updates.length > 0) {
        // Create notifications for each update
        for (const update of updates) {
          await ctx.memory.notifications.create({
            issueId: ctx.issueId,
            source: "my-plugin",
            sourceId: `update-${update.id}`,
            priority: "normal",
            title: update.title,
            body: update.body,
          });
        }
      }
      
      return {
        hasChanges: updates.length > 0,
        data: updates,
      };
    },
  };
}

// src/index.ts
import { createMyMonitor } from "./monitor";

setup(config) {
  const { monitors, hooks } = useJiratown();

  // Register monitor definition (once)
  monitors.registerMonitor(createMyMonitor(config));

  // Start monitor when agent spawns
  hooks.on("agent.create.post", ({ adapter }) => {
    monitors.startMonitor("my-service-updates", adapter.issueId);
  });

  // Stop when agent stops
  hooks.on("agent.stop.post", ({ adapter }) => {
    monitors.stopMonitor("my-service-updates", adapter.issueId);
  });
}
```

### 4. Steering Rules

Guide idle agents with autonomous reminders.

```typescript
// src/steering.ts
import type { SteeringRuleConfig } from "@jiratown/core";

export const mySteeringRules: SteeringRuleConfig[] = [
  {
    id: "my-plugin-update-check",
    name: "My Service Update Check",
    description: "Reminds agents about pending updates from My Service",
    
    condition: {
      status: ["implementing", "in_review"],
      hook: ["agent.idle"],
      when: async (ctx) => {
        // Check if there are unread notifications from this plugin
        return ctx.notifications.some(n => n.source === "my-plugin");
      },
    },
    
    reminder: async (ctx) => {
      const updates = ctx.notifications.filter(n => n.source === "my-plugin");
      return `You have ${updates.length} update(s) from My Service. Please review and acknowledge them.`;
    },
    
    priority: 10,
    once: false,  // Can fire multiple times
  },
  
  {
    id: "my-plugin-blocked-help",
    name: "My Service Blocked Help",
    description: "Provides guidance when agent is blocked",
    
    condition: {
      status: ["blocked"],
    },
    
    reminder: "You are blocked. Check your My Service notifications for any responses. Use `my_plugin_check_status` to see the current state.",
    
    once: true,  // Only fire once per session
  },
];

// src/index.ts
import { mySteeringRules } from "./steering";

setup(config) {
  const { orchestrator } = useJiratown();
  
  for (const rule of mySteeringRules) {
    orchestrator.registerSteeringRule(rule);
  }
}
```

### 5. Prompt Context

Inject context blocks into agent prompts.

```typescript
// src/prompt.ts
import type { PromptContextBlock } from "@jiratown/core";

export async function getMyServiceContext(issueId: string): Promise<PromptContextBlock | null> {
  const state = await fetchMyServiceState(issueId);
  
  if (!state) return null;
  
  return {
    id: "my-service-state",
    title: "My Service Status",
    content: `
Current Status: ${state.status}
Priority: ${state.priority}
Assignee: ${state.assignee || "Unassigned"}
Last Updated: ${state.updatedAt}

## Recent Activity
${state.recentActivity.map(a => `- ${a.timestamp}: ${a.message}`).join("\n")}
    `.trim(),
    priority: 20,  // Lower = earlier in prompt
  };
}

// src/index.ts
import { getMyServiceContext } from "./prompt";

setup(config) {
  const { hooks } = useJiratown();

  hooks.on("prompt.building", async ({ issueId, context }) => {
    const block = await getMyServiceContext(issueId);
    if (block) {
      context.contextBlocks.push(block);
    }
  });
}
```

### 6. Status Sync

Sync Jiratown status with external system.

```typescript
// src/sync.ts
export async function syncStatusToMyService(
  issueId: string,
  from: string,
  to: string
): Promise<void> {
  const mapping: Record<string, string> = {
    pending: "open",
    planning: "in-progress",
    implementing: "in-progress",
    blocked: "blocked",
    in_review: "review",
    done: "closed",
  };
  
  const externalStatus = mapping[to];
  if (externalStatus) {
    await updateMyServiceStatus(issueId, externalStatus);
  }
}

// src/index.ts
import { syncStatusToMyService } from "./sync";

setup(config) {
  const { hooks, db } = useJiratown();

  hooks.on("issue.status_changed", async ({ issue, from, to }) => {
    if (issue.source === "my-service") {
      await syncStatusToMyService(issue.externalId, from, to);
    }
  });
}
```

---

## Hook-Based Communication

### Listening to Core Hooks

```typescript
setup(config) {
  const { hooks } = useJiratown();

  // Agent lifecycle
  hooks.on("agent.create.post", ({ adapter }) => { /* ... */ });
  hooks.on("agent.start.post", ({ adapter }) => { /* ... */ });
  hooks.on("agent.stop.post", ({ adapter }) => { /* ... */ });
  hooks.on("agent.idle", ({ issueId }) => { /* ... */ });
  hooks.on("agent.tool_call", ({ tool, args }) => { /* ... */ });

  // Issue events
  hooks.on("issue.parsed", ({ issue, raw }) => { /* ... */ });
  hooks.on("issue.status_changed", ({ issue, from, to }) => { /* ... */ });
  hooks.on("issue.deleted", ({ issue }) => { /* ... */ });

  // Prompt events
  hooks.on("prompt.building", ({ issueId, context }) => { /* ... */ });
  hooks.on("prompt.built", ({ issueId, prompt }) => { /* ... */ });

  // Monitor events
  hooks.on("monitor.tick", ({ id, issueId, result }) => { /* ... */ });
  hooks.on("monitor.error", ({ id, issueId, error, errorCount }) => { /* ... */ });

  // Notification events
  hooks.on("notification.created", ({ notification, issueId }) => { /* ... */ });

  // Steering events
  hooks.on("steering.reminder", ({ issueId, reminder }) => { /* ... */ });
}
```

### Cross-Plugin Communication

```typescript
// Plugin A: Emit custom events
hooks.emit("my-plugin:task_completed", { 
  taskId: "123",
  result: "success",
});

// Plugin B: Listen to Plugin A
hooks.on("my-plugin:task_completed", ({ taskId, result }) => {
  console.log(`Task ${taskId} completed with ${result}`);
});
```

### PR Enhancement Pattern

Contribute sections to GitHub PRs:

```typescript
hooks.on("github:pr.opening", async (event: unknown) => {
  const openingCtx = event as PROpeningContext;
  
  const data = await fetchMyPluginData(openingCtx.issueId);
  
  if (data) {
    openingCtx.contributions.push({
      section: "My Service Info",
      content: formatMyServiceInfo(data),
      priority: 40,  // Order in PR body
    });
  }
});
```

---

## Testing Plugins

### Unit Tests

```typescript
// __tests__/tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createItemTool } from "../src/tools/create-item";

describe("createItemTool", () => {
  const mockCtx = {
    issueId: "test-issue",
    worktreePath: "/tmp/worktree",
    db: {
      issues: { getById: vi.fn() },
    },
    hooks: { emit: vi.fn() },
    memory: {
      notifications: { create: vi.fn() },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates item successfully", async () => {
    const result = await createItemTool.execute(
      { title: "Test Item", priority: "high" },
      mockCtx as any
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Created item");
  });

  it("handles errors gracefully", async () => {
    // Mock API failure
    vi.mock("../src/api", () => ({
      createItem: vi.fn().mockRejectedValue(new Error("API Error")),
    }));

    const result = await createItemTool.execute(
      { title: "Test" },
      mockCtx as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("API Error");
  });
});
```

### Integration Tests

```typescript
// __tests__/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { bootstrap } from "@jiratown/core";
import myPlugin from "../src";

describe("MyPlugin Integration", () => {
  let jt: Jiratown;

  beforeAll(async () => {
    jt = await bootstrap({
      repoRoot: "/tmp/test-repo",
      plugins: [myPlugin],
      overrides: {
        plugins: {
          "my-plugin": {
            apiKey: "test-key",
            baseUrl: "https://mock-api.test",
          },
        },
      },
    });
  });

  afterAll(async () => {
    await jt.shutdown();
  });

  it("registers parser", () => {
    expect(jt.tracker.canParse("MY-123")).toBe(true);
  });

  it("registers tools", () => {
    const tools = jt.orchestrator.getTools();
    expect(tools.some(t => t.name === "my_plugin_create_item")).toBe(true);
  });
});
```

---

## Publishing Plugins

### 1. Build

```bash
bun run build
```

### 2. Test

```bash
bun run test
```

### 3. Publish

```bash
npm publish --access public
```

### 4. Usage

```typescript
import { bootstrap } from "@jiratown/core";
import myPlugin from "@jiratown/plugin-my-plugin";

const jt = await bootstrap({
  plugins: [myPlugin],
});
```

---

## Best Practices

### 1. Error Handling

```typescript
// Always catch errors in hook handlers
hooks.on("some:event", async (payload) => {
  try {
    await externalApi.call(payload);
  } catch (error) {
    console.error("External API failed:", error);
    // Don't throw — other hooks should still run
  }
});

// Return meaningful error messages from tools
execute: async (args, ctx) => {
  try {
    // ...
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error 
        ? `${error.name}: ${error.message}`
        : "Unknown error occurred",
    };
  }
}
```

### 2. Deduplication

```typescript
// Use sourceId for notification deduplication
await memory.notifications.create({
  issueId,
  source: "my-plugin",
  sourceId: `comment-${comment.id}`,  // Same sourceId = same notification
  title: "New Comment",
  body: comment.body,
});
```

### 3. Resource Cleanup

```typescript
let client: MyServiceClient | null = null;

setup(config) {
  client = new MyServiceClient(config);
  client.connect();
}

teardown() {
  if (client) {
    client.disconnect();
    client = null;
  }
}
```

### 4. Configuration Validation

```typescript
// Validate complex requirements
const MyPluginConfigSchema = z.object({
  auth: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("api-key"),
      apiKey: z.string().min(1),
    }),
    z.object({
      type: z.literal("oauth"),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    }),
  ]),
});
```

### 5. Documentation

- Document all tools with clear descriptions
- Include examples in README
- Document configuration options
- List all hooks emitted/consumed

### 6. Semantic Versioning

- **MAJOR**: Breaking changes to config schema or tool signatures
- **MINOR**: New features, new tools, new config options
- **PATCH**: Bug fixes, performance improvements
