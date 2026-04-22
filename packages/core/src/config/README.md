# Config Module

TOML-based configuration with cascading merge (global → project) and Zod validation.

## Overview

The config module provides:
- **Path resolution** with XDG support
- **Config loading** from TOML files with deep merging
- **Schema validation** via Zod
- **Credential storage** via system keychain

## File Locations

**Global config** (first found wins):
1. `~/.jiratown.toml`
2. `~/.config/jiratown.toml`
3. `~/.config/jiratown/config.toml`

**Project config**: `<repo>/.jiratown.toml`

**Data directory**: `~/.local/share/jiratown/` (respects `XDG_DATA_HOME`)

## Usage

### Resolve Paths

```typescript
import { resolveConfigPaths } from "#config";

const paths = resolveConfigPaths("/path/to/repo");
// {
//   globalConfig: "/home/user/.config/jiratown/config.toml",
//   projectConfig: "/path/to/repo/.jiratown.toml",
//   dataDir: "/home/user/.local/share/jiratown"
// }
```

### Load Config

```typescript
import { resolveConfigPaths, loadConfig } from "#config";

const paths = resolveConfigPaths();
const config = loadConfig(paths);
// Merges: defaults ← global ← project
```

### Parse & Write TOML

```typescript
import { parseTomlFile, writeTomlFile, configToToml } from "#config";

// Read
const data = parseTomlFile("/path/to/config.toml");

// Write
writeTomlFile("/path/to/config.toml", { agent: { harness: "opencode" } });

// Convert to string
const toml = configToToml({ agent: { harness: "opencode" } });
```

### Merge Configs

```typescript
import { mergeConfigs } from "#config";

const merged = mergeConfigs(
  { agent: { harness: "opencode" }, ui: { theme: "dark" } },
  { agent: { model: "sonnet-4" } }
);
// { agent: { harness: "opencode", model: "sonnet-4" }, ui: { theme: "dark" } }
```

### Credentials

```typescript
import { storeCredential, getCredential, deleteCredential } from "#config";

await storeCredential("jiratown", "github_token", "ghp_xxx");
const token = await getCredential("jiratown", "github_token");
await deleteCredential("jiratown", "github_token");
```

## Config Shape

```toml
[agent]
harness = "opencode"           # "opencode" | "claude-code"
model = "sonnet-4"

[behavior]
auto_resume = true
poll_interval = 30000          # ms

[prompt]
custom = """
Project-specific instructions.
"""

[ui]
theme = "tokyonight"

[plugins]
enabled = ["jira", "github"]
directories = []

[plugins.jira]
cloud_id = "company.atlassian.net"
```

## TypeScript Interface

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
    [pluginName: string]: unknown;
  };
}

interface ConfigPaths {
  globalConfig: string;
  projectConfig: string | null;
  dataDir: string;
}
```

## Case Conversion

TOML uses `snake_case`, TypeScript uses `camelCase`. The loader converts automatically:

```toml
# config.toml
[behavior]
auto_resume = true
poll_interval = 5000
```

```typescript
// In code
config.behavior.autoResume    // true
config.behavior.pollInterval  // 5000
```

## Validation

Config is validated with Zod. Invalid configs throw with helpful error messages:

```typescript
import { JiratownConfigSchema } from "#config";

const result = JiratownConfigSchema.safeParse(data);
if (!result.success) {
  console.error(result.error.issues);
}
```

## Exports

| Function | Description |
|----------|-------------|
| `resolveConfigPaths(repoRoot?)` | Find config files and data directory |
| `loadConfig(paths)` | Load and merge configs from paths |
| `parseTomlFile(path)` | Parse TOML file to object |
| `mergeConfigs(...configs)` | Deep merge configs (last wins) |
| `configToToml(config)` | Convert config object to TOML string |
| `writeTomlFile(path, config)` | Write config to TOML file |
| `storeCredential(service, key, value)` | Store in system keychain |
| `getCredential(service, key)` | Retrieve from keychain |
| `deleteCredential(service, key)` | Remove from keychain |

| Type/Schema | Description |
|-------------|-------------|
| `JiratownConfig` | Config interface |
| `ConfigPaths` | Paths interface |
| `JiratownConfigSchema` | Zod validation schema |
| `defaultConfig` | Default config values |
