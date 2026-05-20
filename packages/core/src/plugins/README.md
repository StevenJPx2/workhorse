# plugins

Plugin system with manifest validation, config schemas, and lifecycle hooks.

## Defining a Plugin

### Basic Plugin

```typescript
import { definePlugin } from "#plugins";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "Does things",
    capabilities: {
      parsers: ["jira"],
      monitors: ["comments"],
    },
  },
  setup(ctx) {
    // ctx is the WorkhorseContext with hooks, config, paths
    ctx.hooks.on("issue.parsed", ({ issue }) => {
      console.log("Parsed:", issue.title);
    });
  },
  teardown(ctx) {
    // Cleanup - ctx available here too
  },
});
```

### Plugin with Config Schema

```typescript
import { definePlugin } from "#plugins";
import { z } from "zod/v4";

export default definePlugin({
  manifest: { name: "jira", version: "1.0.0" },
  configSchema: z.object({
    cloudId: z.string().min(1),
    timeout: z.number().default(5000),
  }),
  setup(ctx, config) {
    // config is validated and typed as { cloudId: string, timeout: number }
    console.log("Connecting to:", config.cloudId);
  },
});
```

Config is read from `config.plugins.<plugin-name>`:

```toml
# ~/.workhorse.toml
[plugins.jira]
cloud_id = "company.atlassian.net"
timeout = 10000
```

## Plugin Discovery

Plugins are loaded from:

1. `config.plugins.enabled` — npm packages by name
2. `~/.workhorse/plugins/` — global directory
3. `.workhorse/plugins/` — project directory

## Registry API

```typescript
const registry = new PluginRegistry();
await registry.loadPlugins(); // Load from config and plugin directories

registry.register(plugin); // Add plugin manually
await registry.setup(); // Call all setup()
await registry.teardown(); // Call all teardown() in reverse order

registry.has("my-plugin"); // boolean
registry.get("my-plugin"); // Plugin | undefined
registry.list(); // Plugin[]
```

## Lifecycle

1. **Plugin creation** — `definePlugin()` validates manifest and wraps setup/teardown
2. **Loading** — `loadPlugins()` imports from config.plugins.enabled and plugin directories
3. **Registration** — `register()` adds plugin, emits `plugin.loaded` hook
4. **Setup** — `setup()` calls each plugin's setup with context (and validated config)
5. **Teardown** — `teardown()` calls in reverse order for graceful shutdown

### Error Handling

When a plugin's setup fails:

1. `plugin.error` hook is emitted with `{ name, error }`
2. Error is re-thrown (fail fast behavior)
3. Registry stops setting up further plugins

## Extending Workhorse

Plugins can hook into every part of Workhorse. Here are the common extension points:

### Issue Parser

Register a parser so the Tracker can handle your source's issue IDs/URLs:

```typescript
setup(ctx) {
  // memory/config are injected by Tracker automatically
  ctx.tracker.registerParser({
    source: "jira",
    canParse: (input) => /^[A-Z]+-\d+$/.test(input) || input.includes("atlassian.net"),
    parse: async (input) => {
      // Fetch issue from external API and return ParsedIssue
      return { externalId: "AM-123", source: "jira", title: "...", description: "...", issueType: "task", metadata: {} };
    },
  });
}
```

### Prompt Context

Push additional context blocks into the system prompt via the `prompt.building` hook:

```typescript
setup(ctx) {
  ctx.hooks.on("prompt.building", ({ issueId, context }) => {
    context.contextBlocks.push({
      id: "jira-state",
      title: "Jira State",
      content: `Priority: High\nStatus: In Progress`,
      priority: 10, // Lower = earlier in prompt
    });
  });
}
```

### Monitor (Poller)

Register a monitor definition once at setup, then start it per-issue (e.g., when an agent spawns):

```typescript
setup(ctx) {
  ctx.monitors.registerMonitor({
    id: "jira-comments",
    type: "remote",
    interval: 30000,
    poll: async (monitorCtx) => {
      // Poll external API for changes
      const hasChanges = await checkForNewComments(monitorCtx.issueId);
      return { hasChanges, data: { comments: [] } };
    },
  });

  ctx.hooks.on("orchestrator.spawn.post", ({ adapter }) => {
    ctx.monitors.startMonitor("jira-comments", adapter.issueId);
  });
}
```

### Tools

Register tools that agents can invoke:

```typescript
import type { OrchestratorTool } from "#workflow/orchestrator";

const myTool: OrchestratorTool = {
  name: "workhorse_custom_action",
  description: "Does something useful",
  schema: { type: "object", properties: { param: { type: "string" } }, required: ["param"] },
  execute: async (args, toolCtx) => {
    // args is validated against schema
    // toolCtx has issueId, worktreePath, db, hooks, memory
    return { success: true, output: "Done" };
  },
};

setup(ctx) {
  ctx.orchestrator.registerTool(myTool);
}
```

### Adapters

Register an agent adapter class for a new harness:

```typescript
setup(ctx) {
  ctx.orchestrator.registerAdapter("my-harness", MyAgentAdapter);
}
```

## Files

- `define.ts` — `definePlugin()` factory with setup/teardown wrapping
- `registry.ts` — `PluginRegistry` class
- `types.ts` — `Plugin`, `PluginOptions`, `PluginManifest`, `PluginSymbol`
