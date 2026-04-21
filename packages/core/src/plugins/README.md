# plugins

Plugin system with manifest validation and lifecycle hooks.

## Defining a Plugin

```typescript
import { definePlugin } from "#plugins";
import { useJiratown } from "#context";

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
  setup() {
    const { hooks } = useJiratown();
    hooks.on("issue.parsed", ({ issue }) => {
      console.log("Parsed:", issue.title);
    });
  },
  teardown() {
    // Cleanup
  },
});
```

## Plugin Discovery

Plugins are loaded from:
1. `config.plugins.enabled` — npm packages by name
2. `~/.jiratown/plugins/` — global directory
3. `.jiratown/plugins/` — project directory

## Registry API

```typescript
const registry = await PluginRegistry.create();

registry.register(plugin);      // Add plugin
await registry.setup();         // Call all setup()
await registry.teardown();      // Call all teardown() in reverse order

registry.has("my-plugin");      // boolean
registry.get("my-plugin");      // Plugin | undefined
registry.list();                // Plugin[]
```

## Files

- `define.ts` — `definePlugin()` factory
- `registry.ts` — `PluginRegistry` class
- `types.ts` — `Plugin`, `PluginManifest`, `PluginSymbol`
