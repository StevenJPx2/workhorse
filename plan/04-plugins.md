# Step 4: Plugins

Plugin system with `unctx` for context management. No prop drilling — use `useWorkhorse()` anywhere.

Location: `packages/core/src/plugins/` and `packages/core/src/context/`

## New Dependencies

```
unctx
```

## File Structure

```
packages/core/src/
  context/
    index.ts       # useWorkhorse, runWithContext, setContext, unsetContext
    types.ts       # WorkhorseContext
  plugins/
    index.ts       # public exports
    types.ts       # PluginManifest, PluginOptions, Plugin, PluginSymbol
    define.ts      # definePlugin() factory
    registry.ts    # PluginRegistry class, isPlugin()
    plugins.test.ts
```

## Context Layer

Uses `unctx` with native `AsyncLocalStorage` for async-safe context.

```typescript
// context/index.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { createContext } from "unctx";

// context/types.ts
interface WorkhorseContext {
  readonly config: Config;
  readonly hooks: typeof hooks;
  // Extended in later steps: db, memory, monitor, tracker
}

const ctx = createContext<WorkhorseContext>({
  asyncContext: true,
  AsyncLocalStorage,
});

export const useWorkhorse = ctx.use; // Get context (throws if not set)
export const tryUseWorkhorse = ctx.tryUse; // Get context (returns undefined)
export const runWithContext = ctx.call; // Run fn within context
export const setContext = ctx.set; // Set singleton (for tests)
export const unsetContext = ctx.unset; // Clear singleton
```

## Plugin Types

```typescript
// types.ts
interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  capabilities?: {
    parsers?: string[];
    monitors?: string[];
    tools?: string[];
  };
}

interface PluginOptions {
  manifest: PluginManifest;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

const PluginSymbol = Symbol.for("workhorse.plugin");

interface Plugin extends PluginOptions {
  [PluginSymbol]: true;
}
```

## definePlugin Factory

```typescript
// define.ts
function definePlugin(options: PluginOptions): Plugin {
  const manifest = PluginManifestSchema.parse(options.manifest);
  return {
    ...options,
    manifest,
    [Symbol.for("workhorse.plugin")]: true,
  } as Plugin;
}
```

## isPlugin Type Guard

```typescript
// registry.ts
function isPlugin(value: unknown): value is Plugin {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.for("workhorse.plugin") in value
  );
}
```

## PluginRegistry

```typescript
// registry.ts
class PluginRegistry {
  private plugins: Plugin[] = [];
  private initialized = false;

  private constructor() {}

  static async create(): Promise<PluginRegistry>; // Load from config + discovery

  register(plugin: Plugin): void; // Add plugin, emit plugin.loaded
  async setup(): Promise<void>; // Call setup() on all plugins
  async teardown(): Promise<void>; // Call teardown() in reverse order

  get(name: string): Plugin | undefined;
  has(name: string): boolean;
  list(): Plugin[];
}
```

### Loading Strategy

1. **Explicitly enabled** — `config.plugins.enabled` array (npm packages or paths)
2. **Auto-discovery** — Scan `~/.workhorse/plugins/` (global) and `.workhorse/plugins/` (project)

Duplicates are skipped (first wins).

## Plugin Shape

```typescript
// Example plugin
export default definePlugin({
  manifest: {
    name: "jira",
    version: "1.0.0",
    capabilities: {
      parsers: ["jira"],
      monitors: ["jira-comments"],
    },
  },
  setup() {
    const { hooks } = useWorkhorse();
    hooks.on("issue.parsed", ({ issue }) => {
      console.log("Parsed:", issue.title);
    });
  },
  teardown() {
    console.log("Cleaning up...");
  },
});
```

## Bootstrap Integration

```typescript
// bootstrap.ts
async function bootstrap(repoRoot?: string): Promise<Workhorse> {
  hooks.all.clear();

  const config = new Config(repoRoot);
  const context = { config, hooks };

  return runWithContext(context, async () => {
    const plugins = await PluginRegistry.create();
    plugins.register(loggerPlugin); // Builtin sample plugin
    await plugins.setup();

    return {
      config: Object.freeze(config.get()),
      hooks,
      plugins,
      async shutdown() {
        await plugins.teardown();
        hooks.all.clear();
      },
    };
  });
}
```

## Tests

- `isPlugin()` — returns true for valid plugins, false for everything else
- `definePlugin()` — creates valid plugin, rejects invalid manifest
- `PluginRegistry.register()` — adds plugin, rejects duplicates, emits `plugin.loaded`
- `PluginRegistry.setup()` — calls setup on all plugins, emits `plugin.error` on failure
- `PluginRegistry.teardown()` — calls teardown in reverse order
- `PluginRegistry.list()` — returns plugins in registration order

## Key Design Decisions

| Decision          | Choice                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Context           | `unctx` with native `AsyncLocalStorage`                            |
| Context init      | At bootstrap — `runWithContext()` wraps entire lifecycle           |
| Context growth    | Full object upfront — services created before context is set       |
| Context extension | Core services only — plugins use hooks, not context injection      |
| Plugin definition | `definePlugin()` factory → branded object with symbol              |
| Setup signature   | No args — use `useWorkhorse()` inside                              |
| Loading strategy  | Config `plugins.enabled` + auto-discovery                          |
| Discovery dirs    | `~/.workhorse/plugins/` (global) + `.workhorse/plugins/` (project) |
| Capabilities      | Informational metadata only — actual registration via hooks        |
| Async support     | Native `AsyncLocalStorage` only (Node.js/Bun)                      |
