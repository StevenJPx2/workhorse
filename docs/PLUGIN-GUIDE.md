# Workhorse Plugin Guide

Plugins extend Workhorse's functionality. This guide covers everything you need to create a plugin.

## Basic Plugin

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

```typescript
import { definePlugin, useWorkhorse } from "workhorse-core";
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

Use `useWorkhorse()` inside `setup()` to access services:

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

Parse custom issue formats (URLs, keys). Parsers are tried in registration order — first match wins.

```typescript
setup(config) {
  const { tracker } = useWorkhorse();

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
}
```

The `parse()` function returns a `ParsedIssue`:

```typescript
interface ParsedIssue {
  externalId: string; // External ID (e.g., "MY-123")
  source: string; // Source identifier
  title: string; // Issue title
  description: string; // Issue body
  issueType: string; // Type (task, bug, story, etc.)
  url?: string; // Link to external issue
  assignee?: string; // Assigned user
  labels?: string[]; // Tags
  metadata: Record<string, unknown>; // Source-specific data
}
```

### 2. Add Prompt Context

Inject context blocks into agent prompts via the `prompt.building` hook:

```typescript
setup(config) {
  const { hooks } = useWorkhorse();

  hooks.on("prompt.building", ({ issueId, context }) => {
    context.contextBlocks.push({
      id: "my-service-status",
      title: "My Service Status",
      content: "Current status: OK",
      priority: 50,  // Lower = earlier in prompt (default: 0)
    });
  });
}
```

### 3. Register Monitors

Poll external services for changes. Two-phase API: register once at setup, then start per-issue.

```typescript
setup(config) {
  const { monitors, hooks } = useWorkhorse();

  // Register monitor definition (once)
  monitors.registerMonitor({
    id: "my-service-poll",
    type: "remote",            // "remote" (external API) or "local" (filesystem/process)
    interval: 60000,           // Poll interval in ms
    poll: async (ctx) => {
      // ctx has: issueId, hooks, memory, config
      const updates = await fetchUpdates(ctx.issueId);
      return {
        hasChanges: updates.length > 0,
        data: updates,
      };
    },
  });

  // Start monitor for a specific issue (e.g., when agent spawns)
  hooks.on("agent.create.post", ({ adapter }) => {
    monitors.startMonitor("my-service-poll", adapter.issueId);
  });

  // Stop when agent stops
  hooks.on("agent.stop.post", ({ adapter }) => {
    monitors.stopMonitor("my-service-poll", adapter.issueId);
  });
}
```

**Monitor events:**

| Event           | When                                         |
| --------------- | -------------------------------------------- |
| `monitor.tick`  | Poll returns `hasChanges: true`              |
| `monitor.error` | Poll throws an error (includes `errorCount`) |

Monitors self-stop after 5 consecutive errors.

### 4. Register Tools

Add functions that agents can invoke during execution:

```typescript
import type { OrchestratorTool, ToolExecutionContext, ToolResult } from "workhorse-core";

setup(config) {
  const { orchestrator } = useWorkhorse();

  const myTool: OrchestratorTool = {
    name: "my_service_action",
    description: "Perform an action in My Service",
    schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action to perform" },
        target: { type: "string", description: "Target resource" },
      },
      required: ["action", "target"],
    },
    execute: async (args: unknown, ctx: ToolExecutionContext): Promise<ToolResult> => {
      const { action, target } = args as { action: string; target: string };

      // ctx provides: issueId, worktreePath, db, hooks, memory
      try {
        const result = await performAction(action, target);
        return { success: true, output: `Action ${action} completed` };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };

  orchestrator.registerTool(myTool);
}
```

**Source-specific tools:**

Tools can be restricted to specific issue sources using the `sources` field:

```typescript
const jiraTool: OrchestratorTool = {
  name: "jira_add_comment",
  description: "Add a comment to a Jira issue",
  sources: ["jira"], // Only shown for Jira-sourced issues
  schema: {
    /* ... */
  },
  execute: async (args, ctx) => {
    /* ... */
  },
};

const multiSourceTool: OrchestratorTool = {
  name: "ticket_link",
  description: "Link to an external ticket",
  sources: ["jira", "github"], // Shown for both Jira and GitHub issues
  schema: {
    /* ... */
  },
  execute: async (args, ctx) => {
    /* ... */
  },
};

// Tools without `sources` (or with empty array) are available for all issue sources
const globalTool: OrchestratorTool = {
  name: "workhorse_status",
  description: "Update issue status",
  // sources: undefined — available for all sources
  schema: {
    /* ... */
  },
  execute: async (args, ctx) => {
    /* ... */
  },
};
```

This is useful for plugins that integrate with external services — their tools should only appear when working on issues from that source. For example, Jira tools (`jira_add_comment`, `jira_transition_issue`) are hidden when working on a local or GitHub issue.

### 5. Register Agent Adapters

Add support for a new AI harness by extending `AgentAdapter`:

```typescript
import { AgentAdapter, definePlugin } from "workhorse-core";
import type { AgentState } from "workhorse-core";

class MyHarnessAdapter extends AgentAdapter {
  override readonly harness = "my-harness";
  static override readonly displayName = "My Harness";
  static override readonly icon = "🔧";

  private session: MySession | null = null;

  protected override async doStart(): Promise<void> {
    this.session = await createMySession({
      cwd: this.worktreePath,
      systemPrompt: this.systemPrompt,
    });
    await this.session.prompt(this.initialMessage);
  }

  override async sendMessage(content: string): Promise<void> {
    if (!this.session) throw new Error("Not started");
    await this.session.prompt(content);
  }

  protected override async doStop(): Promise<void> {
    this.session?.dispose();
    this.session = null;
  }

  override isRunning(): boolean {
    return this.session?.isActive ?? false;
  }
}

export default definePlugin({
  manifest: {
    name: "my-harness",
    version: "1.0.0",
    capabilities: { adapters: ["my-harness"] },
  },
  setup() {
    const { orchestrator } = useWorkhorse();
    orchestrator.registerAdapter("my-harness", MyHarnessAdapter);
  },
});
```

**What AgentAdapter provides automatically:**

- Worktree creation (`createWorktree`)
- Prompt building (`PromptEngineer.buildHybridPrompt`)
- Steering rule subscription and disposal
- Notification push (`notification.created` → `sendMessage`)
- Steering reminder delivery (`steering.reminder` → `sendMessage`)
- Hook emission for lifecycle events

**What subclasses must implement:**

- `doStart()` — Harness-specific start
- `sendMessage(content)` — Send a message to the running agent
- `doStop()` — Harness-specific cleanup
- `isRunning()` — Whether the agent is actively processing

### 6. Register Steering Rules

Add autonomous behavior rules for idle agents:

```typescript
setup(config) {
  const { orchestrator } = useWorkhorse();

  // Simple static reminder
  orchestrator.registerSteeringRule({
    id: "my-reminder",
    name: "My Reminder",
    description: "Reminds agents about something when idle",
    condition: {
      status: ["implementing"],  // Only when status matches
      // source: ["jira"],       // Only for specific sources
      // hook: ["agent.idle"],   // Only after specific hook events
    },
    reminder: "Don't forget to check for updates!",
    priority: 10,
    once: true,  // Only fires once per agent session
  });

  // Dynamic reminder with context
  orchestrator.registerSteeringRule({
    id: "my-dynamic-reminder",
    name: "Dynamic Reminder",
    description: "Context-aware reminder",
    condition: {
      when: async (ctx) => {
        // ctx has: issue, notifications, toolHistory
        return ctx.notifications.some(n => n.source === "my-service");
      },
    },
    reminder: async (ctx) => {
      const notifs = ctx.notifications.filter(n => n.source === "my-service");
      return `You have ${notifs.length} notification(s) from My Service.`;
    },
  });
}
```

**Condition filters:**
| Filter | Default | Description |
|--------|---------|-------------|
| `status` | `[]` (any) | Only evaluate when issue status is in this list |
| `source` | `[]` (any) | Only evaluate when issue source is in this list |
| `hook` | `[]` (none) | At least one of these hooks must have fired |
| `when` | `async () => true` | Custom async condition function |

**Evaluation rules:**

- Never reminds when issue status is `"blocked"`
- Respects cooldown (default: 30s between reminders)
- `once: true` only fires once per agent session
- `agent.idle` is debounced (default: 2s)

### 7. Create Notifications

Push notifications to agent inboxes. Notifications are included in the agent's system prompt as XML:

```typescript
setup(config) {
  const { memory, hooks } = useWorkhorse();

  // Create with deduplication (by sourceId)
  await memory.notifications.create({
    issueId: "issue-internal-id",
    source: "my-service",
    sourceId: "my-service-update-456",  // Dedup key — same sourceId returns existing
    title: "Configuration changed",
    body: "The deployment config was updated. Please review.",
    priority: "high",  // "blocking" | "high" | "normal" | "low"
    metadata: { changedBy: "john.doe" },
  });

  // Generate inbox XML for system prompt
  const unread = await memory.notifications.getUnread(issueId);
  const xml = memory.notifications.generateInbox(unread);
  // <system_inbox>
  //   <notification id="..." priority="high" source="my-service">
  //     <title>Configuration changed</title>
  //     <body>The deployment config was updated...</body>
  //   </notification>
  // </system_inbox>
}
```

### 8. Register TUI Renderers

Register activity renderers for the TUI:

```typescript
setup(config) {
  const { hooks } = useWorkhorse();

  hooks.emit("tui.register_renderer", {
    id: "my-plugin",
    renderer: (input) => {
      if (input.kind === "tool" && input.tool.startsWith("my_")) {
        return {
          icon: "🔧",
          title: `My: ${input.tool}`,
          subtitle: formatMyToolArgs(input.args),
          style: "box",
        };
      }
      return null;  // Let other renderers handle it
    },
    priority: 10,  // Higher = tried first
  });
}
```

### 9. Provide Skills

Skills are on-demand instruction sets that agents can load when working on specific tasks. Unlike prompt context (which is always included), skills are only loaded when explicitly requested via the `load_skill` tool.

```typescript
export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    capabilities: {
      skills: ["database-migrations", "api-design"],
    },
  },
  setup(config) {
    const { orchestrator } = useWorkhorse();

    // Register skills from the manifest
    orchestrator.skillRegistry.registerPluginSkill("my-plugin", {
      id: "database-migrations",
      name: "Database Migrations",
      description:
        "Step-by-step guide for creating and running database migrations",
      content: `
# Database Migration Guide

When creating database migrations, follow these steps:

1. **Generate migration file**: Run \`bun run db:generate\`
2. **Edit the migration**: Add your schema changes
3. **Test locally**: Run \`bun run db:migrate\`
4. **Verify**: Check the database state matches expectations
      `.trim(),
      priority: 50,
    });

    orchestrator.skillRegistry.registerPluginSkill("my-plugin", {
      id: "api-design",
      name: "API Design Patterns",
      description: "Best practices for designing REST APIs in this project",
      content: loadSkillFromFile("./skills/api-design.md"),
      priority: 50,
    });
  },
});
```

**Skill properties:**

| Property      | Type     | Required | Description                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------- |
| `id`          | `string` | Yes      | Unique identifier (forms `pluginName:id` in registry)      |
| `name`        | `string` | Yes      | Human-readable name                                        |
| `description` | `string` | Yes      | Brief description shown in agent's skill list              |
| `content`     | `string` | Yes      | Full instructions (Markdown)                               |
| `priority`    | `number` | No       | Display order in skill list (lower = earlier, default: 50) |

**How skills appear to agents:**

The agent sees a brief skills summary in their system prompt:

```
## Available Skills
Load a specialized skill that provides domain-specific instructions and workflows.
...
- **database-migrations**: Step-by-step guide for creating and running database migrations
- **api-design**: Best practices for designing REST APIs in this project
```

When the agent calls `load_skill({ skillId: "my-plugin:database-migrations" })`, the full content is returned.

**Skill file format (optional YAML frontmatter):**

```markdown
---
name: Database Migrations
description: Step-by-step guide for creating and running database migrations
priority: 30
---

# Database Migration Guide

When creating database migrations...
```

**Local skills (not plugin-provided):**

Users can also create skills in these locations (no plugin required):

- `.workhorse/skills/*.md` — Project-specific skills
- `~/.workhorse/skills/*.md` — Global user skills
- `.claude/skills/*.md` — Claude-compatible skills

These use prefixes: `local:`, `global:`, `claude:` respectively.

**Built-in skills:**

Workhorse provides two built-in skills:

- `builtin:plugin-development` — Guide for creating Workhorse plugins
- `builtin:skill-development` — Guide for creating custom skills

### 10. Listen to Hooks

React to system events:

```typescript
setup(config) {
  const { hooks } = useWorkhorse();

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

  // Plugin events
  hooks.on("plugin.loaded", ({ name }) => { /* ... */ });
  hooks.on("plugin.error", ({ name, error }) => { /* ... */ });

  // Skill events
  hooks.on("skill.registered", ({ skill }) => { /* ... */ });
}
```

## Plugin Lifecycle

1. **Registration** — `plugins.register(plugin)` adds to registry, emits `plugin.loaded`
2. **Discovery** — `plugins.discoverCustomPlugins()` loads from plugin directories
3. **Setup** — `plugins.setup()` validates config and calls each plugin's `setup(config)`
4. **Runtime** — Plugin hooks, tools, monitors, and steering rules are active
5. **Teardown** — `plugins.teardown()` calls `teardown()` in reverse registration order

### Error Handling

- Setup errors emit `plugin.error` and are re-thrown (fail fast)
- Each plugin's hook handlers should catch their own errors
- Runtime errors in hooks don't affect other hooks

```typescript
setup(config) {
  const { hooks } = useWorkhorse();

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
hooks.emit("my-plugin:data_ready", { data: myData });

// Plugin B: Listen to Plugin A
hooks.on("my-plugin:data_ready", ({ data }) => {
  // Use data from Plugin A
});
```

### Hook-Based PR Enhancement

The `github:pr.opening` hook allows plugins to contribute sections to PR descriptions. This enables coordination without tight coupling between plugins.

**How it works:**

1. The `github_open_pr` tool emits `github:pr.opening` with a `contributions` array
2. Plugins listen and push their content contributions
3. After a short delay (100ms), contributions are sorted by priority and assembled into the PR body

**PRContentContribution type:**

```typescript
interface PRContentContribution {
  section: string; // Section heading (e.g., "Related Tickets")
  content: string; // Markdown content
  priority?: number; // Lower = earlier in PR body (default: 50)
}
```

**PROpeningContext type:**

```typescript
interface PROpeningContext {
  issueId: string;
  title: string;
  body: string;
  base: string;
  head: string;
  draft: boolean;
  worktreePath: string;
  contributions: PRContentContribution[]; // Push to this array
}
```

**Example: Contributing a PR section**

```typescript
// In your plugin's setup
ctx.hooks.on("github:pr.opening", async (event: unknown) => {
  const openingCtx = event as PROpeningContext;

  // Fetch data for your section
  const data = await fetchMyData(openingCtx.issueId);

  if (data) {
    openingCtx.contributions.push({
      section: "My Section",
      content: formatMyContent(data),
      priority: 30, // Show between tickets (10) and screenshots (80)
    });
  }
});
```

**Built-in PR contributions:**

| Plugin         | Section         | Priority | Content                              |
| -------------- | --------------- | -------- | ------------------------------------ |
| **Jira**       | Related Tickets | 10       | Table of linked Jira issues          |
| **Playwright** | Screenshots     | 80       | Images from `screenshot-*.png` files |

**Example PR body structure:**

```markdown
## Summary

Added dashboard feature with real-time updates

## Related Tickets

| Ticket                                               | Summary       | Status      |
| ---------------------------------------------------- | ------------- | ----------- |
| [PROJ-123](https://jira.example.com/browse/PROJ-123) | Add dashboard | In Progress |

## Screenshots

![screenshot-1.png](./screenshot-1.png)

![screenshot-2.png](./screenshot-2.png)
```

### Post-Event Hooks

The Jira plugin also listens for GitHub events to add comments on Jira issues:

```typescript
// In jira plugin's cross-plugin-sync.ts
hooks.on("github:pr.created", async ({ issueId, pr }) => {
  await client.addComment(issueId, `PR opened: ${pr.url}`);
});

hooks.on("github:pr.merged", async ({ issueId, pr }) => {
  await client.addComment(issueId, `PR merged: ${pr.url}`);
  await client.transitionIssue(issueId, "Done");
});
```

## Example: Full Plugin

```typescript
import {
  type OrchestratorTool,
  type ToolResult,
  definePlugin,
  useWorkhorse,
} from "workhorse-core";
import { z } from "zod/v4";

export const SlackConfigSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().default("#dev"),
  notifyOnPrMerge: z.boolean().default(true),
});

export type SlackConfig = z.infer<typeof SlackConfigSchema>;

export default definePlugin({
  manifest: {
    name: "slack",
    version: "1.0.0",
    description: "Slack notifications for Workhorse events",
    capabilities: {
      tools: ["send_slack_message"],
    },
  },
  configSchema: SlackConfigSchema,

  setup(config) {
    const { hooks, orchestrator } = useWorkhorse();

    // Notify on PR merge
    if (config.notifyOnPrMerge) {
      hooks.on("github:pr.merged", async ({ issueId, prUrl }) => {
        await sendSlackMessage(config.webhookUrl, {
          channel: config.channel,
          text: `PR merged for issue ${issueId}: ${prUrl}`,
        });
      });
    }

    // Add tool for agents to send Slack messages
    const slackTool: OrchestratorTool = {
      name: "send_slack_message",
      description: "Send a message to Slack",
      schema: {
        type: "object",
        properties: {
          message: { type: "string" },
          channel: { type: "string" },
        },
        required: ["message"],
      },
      execute: async (args) => {
        const { message, channel } = args as {
          message: string;
          channel?: string;
        };
        await sendSlackMessage(config.webhookUrl, {
          channel: channel || config.channel,
          text: message,
        });
        return { success: true, output: "Sent to Slack" };
      },
    };
    orchestrator.registerTool(slackTool);

    // Register steering rule for blocked agents
    orchestrator.registerSteeringRule({
      id: "slack-blocked-alert",
      name: "Slack Blocked Alert",
      description: "Notifies Slack when an agent is blocked",
      condition: {
        hook: ["issue.status_changed"],
        when: async (ctx) => ctx.issue.status === "blocked",
      },
      reminder:
        "You are blocked. Check for human responses in your notifications.",
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

## Adding a New Plugin Package

1. Create directory under `packages/plugins/<name>/`
2. Add `package.json` with proper naming (`workhorse-plugin-<name>`)
3. Create `src/index.ts` with `definePlugin()`
4. Add to workspace in root `package.json` (already includes `packages/plugins/*`)
5. Register in application after bootstrap:

```typescript
import myPlugin from "workhorse-plugin-my-plugin";

const jt = await bootstrap({
  plugins: [myPlugin],
});
```

6. Add plugin config to `.workhorse.toml`:

```toml
[plugins.my-plugin]
api_key = "secret"
```

## Module READMEs

Each module has its own README with detailed documentation:

- `packages/core/README.md` — Core package overview and API reference
- `packages/core/src/config/README.md` — Config loading
- `packages/core/src/context/README.md` — Context system
- `packages/core/src/db/README.md` — Database
- `packages/core/src/lib/hooks/README.md` — Hooks
- `packages/core/src/lib/git/README.md` — Git worktree operations
- `packages/core/src/plugins/README.md` — Plugin system
- `packages/core/src/services/memory/README.md` — Memory service
- `packages/core/src/services/monitor/README.md` — Monitor service
- `packages/core/src/workflow/orchestrator/README.md` — Orchestrator
- `packages/core/src/workflow/steering/README.md` — Steering rules
- `packages/core/src/workflow/tracker/README.md` — Tracker
- `packages/plugins/github/README.md` — GitHub plugin
- `packages/plugins/jira/README.md` — Jira plugin
- `packages/plugins/playwright/README.md` — Playwright browser automation plugin
- `packages/plugins/pi-adapter/README.md` — Pi adapter plugin
- `packages/tui/README.md` — TUI
