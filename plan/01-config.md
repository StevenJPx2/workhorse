# Step 1: Config

TOML config with cascading merge (global → project), plugin-extensible. Deps: `smol-toml`, `defu`, `string-ts`, `keytar`.

Location: `packages/core/src/config/`

## Config Files

**Global** (first found wins):
1. `~/.jiratown.toml`
2. `~/.config/jiratown.toml`
3. `~/.config/jiratown/config.toml`

**Project**: `<repo>/.jiratown.toml`

Project overrides global. Missing keys fall back to defaults.

## Data Directory

Application data (database, logs, cache) lives in:
- `~/.local/share/jiratown/`

Respects `XDG_DATA_HOME` if set: `$XDG_DATA_HOME/jiratown/`

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

## Functions

Pure functions for config resolution and loading:

```typescript
// Resolve config file paths (uses XDG_DATA_HOME, finds first existing global config)
function resolveConfigPaths(repoRoot?: string): ConfigPaths

// Load and merge configs: defaults ← global ← project
function loadConfig(paths: ConfigPaths): JiratownConfig
```

Additional helpers for plugins: `parseTomlFile`, `mergeConfigs`, `configToToml`, `writeTomlFile`.

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
