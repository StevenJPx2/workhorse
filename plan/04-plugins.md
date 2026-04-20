# Step 4: Plugins

Plugin loader and registry. Plugins hook into every part of Jiratown.

Location: `packages/core/src/plugins/`

## Domain Types (colocated)

```typescript
interface PluginManifest {
  name: string
  version: string
  description?: string
  parsers?: string[]
  monitors?: string[]
  tools?: string[]
}

interface Plugin {
  manifest: PluginManifest
  setup: (ctx: PluginContext) => Promise<void> | void
}

interface PluginContext {
  hooks: Hooks
  config: Readonly<JiratownConfig>
  // Extended by later steps as services are built
}
```

## Plugin Shape

```typescript
export default {
  manifest: {
    name: "jira",
    version: "1.0.0",
    parsers: ["jira"],
    monitors: ["jira-comments"],
  },
  setup(ctx) {
    ctx.hooks.on("issue.parsing", async ({ input }) => { /* ... */ })
  }
} satisfies Plugin
```

## PluginRegistry (class)

```typescript
class PluginRegistry {
  private plugins = new Map<string, Plugin>()

  async register(plugin: Plugin): Promise<void>
  get(name: string): Plugin | undefined
  list(): Plugin[]
  has(name: string): boolean
  unregister(name: string): void
}
```

On `register()`: validate manifest (zod), reject duplicates, call `setup(ctx)`, emit `plugin.loaded` / `plugin.error`.

## Loader

```typescript
async function loadPlugins(options: PluginLoaderOptions): Promise<Plugin[]>
```

Loading strategy:
1. Explicit paths — `import()` directly
2. Names from config — resolve against `.jiratown/plugins/` (project) and `~/.jiratown/plugins/` (global)
3. Directory scan — find `.ts`/`.js` files, `import()`, validate shape

## PluginContext

Starts with `{ hooks, config }`. Extended by later steps: `memory`, `monitors`, `issueProvider`, `agentAdapter`.

## Tests

- Register valid plugin, reject duplicates, reject invalid manifests
- Setup errors caught and reported via `plugin.error` hook
- Loader discovers plugins from directories, skips non-plugins
