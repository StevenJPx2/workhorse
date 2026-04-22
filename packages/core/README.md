# @jiratown/core

Core library for Jiratown providing config management, plugin system, context, and hooks.

## Installation

```bash
bun add @jiratown/core
```

## Usage

### Bootstrap

```typescript
import { bootstrap } from "@jiratown/core";

const jiratown = await bootstrap({ repoRoot: process.cwd() });

// Access config and paths
console.log(jiratown.config);
console.log(jiratown.paths);

// Use hooks
jiratown.hooks.on("plugin.loaded", ({ name }) => {
  console.log(`Plugin loaded: ${name}`);
});

// Shutdown when done
await jiratown.shutdown();
```

### Context

Access the current Jiratown instance from anywhere using async context:

```typescript
import { useJiratown } from "@jiratown/core";

function myFunction() {
  const { config, hooks, paths } = useJiratown();
  // ...
}
```

### Config

Pure functions for config resolution and loading:

```typescript
import { resolveConfigPaths, loadConfig } from "@jiratown/core";

// Resolve config file paths
const paths = resolveConfigPaths("/path/to/repo");
// { globalConfig: "~/.config/jiratown/config.toml", projectConfig: "/path/to/repo/.jiratown.toml", dataDir: "~/.local/share/jiratown" }

// Load and merge configs
const config = loadConfig(paths);
```

### Plugins

Define plugins with optional config validation:

```typescript
import { definePlugin } from "@jiratown/core";
import { z } from "zod/v4";

// Plugin without config
export const simplePlugin = definePlugin({
  manifest: {
    name: "simple",
    version: "1.0.0",
  },
  setup() {
    console.log("Simple plugin loaded");
  },
});

// Plugin with typed config
export const configuredPlugin = definePlugin({
  manifest: {
    name: "configured",
    version: "1.0.0",
  },
  configSchema: z.object({
    apiUrl: z.string().url(),
    timeout: z.number().default(5000),
  }),
  setup(config) {
    // config is typed as { apiUrl: string; timeout: number }
    console.log(`Connecting to ${config.apiUrl}`);
  },
});
```

### Plugin Registry

```typescript
import { PluginRegistry, definePlugin } from "@jiratown/core";

// Create registry (auto-loads plugins from config)
const registry = await PluginRegistry.create();

// Or register plugins manually
const myPlugin = definePlugin({ /* ... */ });
registry.register(myPlugin);

// Setup all plugins (validates config, calls setup functions)
await registry.setup();

// Teardown when done
await registry.teardown();
```

## Config Schema

```typescript
interface JiratownConfig {
  agent: {
    harness: "opencode" | "claude-code";
    model?: string;
  };
  behavior: {
    autoResume: boolean;
    pollInterval: number;
  };
  prompt: {
    custom?: string;
  };
  ui: {
    theme: string;
  };
  plugins: {
    enabled: string[];
    directories: string[];
    [pluginName: string]: unknown; // Plugin-specific config
  };
}
```

## Config Paths

```typescript
interface ConfigPaths {
  globalConfig: string;      // Path to global config file
  projectConfig: string | null; // Path to project config (null if not in a repo)
  dataDir: string;           // Data directory (~/.local/share/jiratown)
}
```

Global config locations (first found wins):
1. `~/.jiratown.toml`
2. `~/.config/jiratown.toml`
3. `~/.config/jiratown/config.toml`

## API Reference

### Config Module

| Export | Description |
|--------|-------------|
| `resolveConfigPaths(repoRoot?)` | Resolve config file paths |
| `loadConfig(paths)` | Load and merge configs |
| `parseTomlFile(path)` | Parse a TOML file |
| `mergeConfigs(...configs)` | Deep merge configs (last wins) |
| `configToToml(config)` | Convert config to TOML string |
| `writeTomlFile(path, config)` | Write config to TOML file |
| `JiratownConfigSchema` | Zod schema for config validation |
| `defaultConfig` | Default config values |

### Plugin Module

| Export | Description |
|--------|-------------|
| `definePlugin(options)` | Create a plugin |
| `PluginRegistry` | Plugin management class |
| `isPlugin(value)` | Type guard for plugins |
| `PluginSymbol` | Symbol identifying plugins |

### Context Module

| Export | Description |
|--------|-------------|
| `useJiratown()` | Get current Jiratown context |

### Bootstrap

| Export | Description |
|--------|-------------|
| `bootstrap(options)` | Initialize Jiratown instance |

## License

MIT
