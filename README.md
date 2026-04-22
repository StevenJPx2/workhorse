# Jiratown

An AI-powered Jira workflow assistant that helps manage tickets, track progress, and automate development workflows.

## Installation

```bash
bun install
```

## Configuration

Jiratown uses TOML configuration files with cascading merge (global → project).

### Config File Locations

**Global** (first found wins):
1. `~/.jiratown.toml`
2. `~/.config/jiratown.toml`
3. `~/.config/jiratown/config.toml`

**Project**: `<repo>/.jiratown.toml`

Project config overrides global. Missing keys fall back to defaults.

### Data Directory

Application data (database, logs, cache) lives in:
- `~/.local/share/jiratown/`

Respects `XDG_DATA_HOME` if set: `$XDG_DATA_HOME/jiratown/`

### Example Config

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

[plugins.jira]
cloud_id = "company.atlassian.net"

[plugins.github]
auto_poll_reviews = true
```

## Plugins

Plugins extend Jiratown's functionality. Define a plugin with optional config validation:

```typescript
import { definePlugin } from "@jiratown/core";
import { z } from "zod/v4";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "My custom plugin",
  },
  // Optional: Zod schema for plugin config validation
  configSchema: z.object({
    apiKey: z.string(),
    timeout: z.number().default(5000),
  }),
  // Validated config is passed to setup when configSchema is provided
  setup(config) {
    console.log("Plugin initialized with:", config.apiKey);
  },
  teardown() {
    console.log("Plugin cleaned up");
  },
});
```

Plugin config is defined in the main config file under `[plugins.<name>]`:

```toml
[plugins.my-plugin]
api_key = "secret"
timeout = 10000
```

## Development

```bash
# Run tests
bun test

# Run tests for a specific package
cd packages/core && bun test

# Type checking
bun run typecheck
```

## Architecture

```
packages/
├── core/           # Core library: config, plugins, context, hooks
│   └── src/
│       ├── config/     # Config loading & validation
│       ├── plugins/    # Plugin system
│       ├── context/    # Async context (useJiratown)
│       └── hooks/      # Event system
└── cli/            # Command-line interface
```

## License

MIT
