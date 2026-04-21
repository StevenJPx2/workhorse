# config

Cascading TOML configuration with plugin schema validation.

## Usage

```typescript
import { Config } from "#config";

const config = new Config(repoRoot);  // Loads global + project configs
const settings = config.get();        // JiratownConfig
const paths = config.paths(repoRoot); // ConfigPaths
```

## Config Priority

1. `DEFAULT_CONFIG` (hardcoded defaults)
2. `~/.jiratown/config.toml` (global)
3. `.jiratown.toml` (project) — **wins**

## Plugin Config

Plugins validate their config section via Zod schemas:

```typescript
config.registerPluginConfig({
  pluginName: "jira",
  schema: z.object({ cloudId: z.string().min(1) }),
});

const jira = config.getPluginConfig<JiraConfig>("jira");
```

## Files

- `config.ts` — `Config` class (load, save, plugin config)
- `defaults.ts` — `DEFAULT_CONFIG`
- `paths.ts` — `getConfigPaths()` resolves global/project paths
- `parse.ts` — TOML read/write, `mergeConfigs()`
- `keychain.ts` — OS keychain via `keytar`
- `types.ts` — `JiratownConfig`, `ConfigPaths`, `AgentHarness`
