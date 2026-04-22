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
    // ctx is the JiratownContext with hooks, config, paths
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
# ~/.jiratown.toml
[plugins.jira]
cloud_id = "company.atlassian.net"
timeout = 10000
```

## Plugin Discovery

Plugins are loaded from:
1. `config.plugins.enabled` — npm packages by name
2. `~/.jiratown/plugins/` — global directory
3. `.jiratown/plugins/` — project directory

## Registry API

```typescript
const registry = new PluginRegistry();
await registry.loadPlugins();       // Load from config and directories

registry.register(plugin);          // Add plugin manually
await registry.setup();             // Call all setup()
await registry.teardown();          // Call all teardown() in reverse order

registry.has("my-plugin");          // boolean
registry.get("my-plugin");          // Plugin | undefined
registry.list();                    // Plugin[]
```

## Lifecycle

1. **Plugin creation** — `definePlugin()` validates manifest and wraps setup/teardown
2. **Loading** — `loadPlugins()` imports from config.plugins.enabled and directories
3. **Registration** — `register()` adds plugin, emits `plugin.loaded` hook
4. **Setup** — `setup()` calls each plugin's setup with context (and validated config)
5. **Teardown** — `teardown()` calls in reverse order for graceful shutdown

### Error Handling

When a plugin's setup fails:
1. `plugin.error` hook is emitted with `{ name, error }`
2. Error is re-thrown (fail fast behavior)
3. Registry stops setting up further plugins

## Files

- `define.ts` — `definePlugin()` factory with setup/teardown wrapping
- `registry.ts` — `PluginRegistry` class
- `types.ts` — `Plugin`, `PluginOptions`, `PluginManifest`, `PluginSymbol`
