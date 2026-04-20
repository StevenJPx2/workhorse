# Step 1: Config

TOML config with cascading merge (global → project), plugin-extensible. Deps: `smol-toml`, `defu`, `string-ts`, `keytar`.

Location: `packages/core/src/config/`

## Config Files

1. **Global**: `~/.jiratown/config.toml`
2. **Project**: `<repo>/.jiratown.toml`

Project overrides global. Missing keys fall back to defaults.

## Shape

```toml
[agent]
harness = "opencode"           # "opencode" | "claude-code"
model = "sonnet-4"

[behavior]
auto_resume = true
poll_interval = 30000          # ms

[prompt]
custom = """
Project-specific instructions appended to every agent prompt.
"""

[ui]
theme = "tokyonight"

[plugins]
enabled = ["jira", "github"]
directories = []

[plugins.jira]
cloud_id = "company.atlassian.net"

[plugins.github]
auto_poll_reviews = true
```

## Interface

```typescript
interface JiratownConfig {
  agent: { harness: AgentHarness; model?: string }
  behavior: { autoResume: boolean; pollInterval: number }
  prompt: { custom?: string }
  ui: { theme: string }
  plugins: {
    enabled: string[]
    directories: string[]
    [pluginName: string]: unknown
  }
}
```

TOML `snake_case` ↔ TypeScript `camelCase` — loader converts.

## Class

`Config` consolidates loading, saving, and plugin schema registry.

```typescript
class Config {
  load(repoRoot?: string, globalDir?: string): this  // defaults ← global ← project
  get(): JiratownConfig
  paths(repoRoot?: string): ConfigPaths
  saveGlobal(overrides: Partial<JiratownConfig>): void
  saveProject(repoRoot: string, overrides: Partial<JiratownConfig>): void
  registerPluginConfig(schema: PluginConfigSchema): void
  getPluginConfig<T>(pluginName: string): T | undefined
  validatePluginConfigs(): ValidationResult[]
}
```

Pure helpers remain exported for direct use by plugins: `parseTomlFile`, `mergeConfigs`, `configToToml`, `getConfigPaths`.

## Credential Storage

Sensitive values in system keychain via `keytar`, not TOML files.

```typescript
function storeCredential(service: string, key: string, value: string): Promise<void>
function getCredential(service: string, key: string): Promise<string | null>
function deleteCredential(service: string, key: string): Promise<void>
```

Service name: `"jiratown"`. Keys: `"github_token"`, `"jira_token"`, etc.

## Validation

Zod schema with defaults. `plugins` section uses `.passthrough()` for plugin-specific keys.

## Tests

- Load defaults when no config files exist
- Cascading merge: project overrides global (deep)
- Schema validation with helpful errors
- Plugin config registration and validation
- Keychain store/retrieve/delete
- Path resolution
