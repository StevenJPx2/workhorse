# Jiratown Quick Start Guide

Get up and running with Jiratown in minutes.

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- Git
- [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent) or another supported agent harness
- Jira Cloud account with API access

## Installation

```bash
# Install dependencies
bun install

# Run initial setup
jiratown setup
```

## Configuration

### 1. Global Configuration

Create `~/.jiratown.toml`:

```toml
[agent]
harness = "pi-coding-agent"        # Agent harness to use
model = "anthropic/claude-sonnet-4" # Default model

[behavior]
auto_resume = true                  # Resume agents on restart
poll_interval = 30000               # Monitor poll interval (ms)

[ui]
theme = "tokyonight"                # UI theme

[steering]
enabled = true                      # Enable steering rules
debounce_ms = 2000                  # Idle debounce
cooldown_ms = 30000                 # Min time between reminders

[plugins.jira]
cloud_id = "yourcompany.atlassian.net"

[plugins.github]
poll_interval = 30000
```

### 2. Project Configuration (Optional)

Create `.jiratown.toml` in your project root:

```toml
# Override global settings for this project
[agent]
model = "anthropic/claude-opus-4"  # Use Opus for this project

[prompt]
custom = """
This is a TypeScript monorepo using Bun.
- Use Vitest for testing
- Follow ESLint rules
- Write tests for all new code
"""
```

### 3. Store Credentials

```bash
# OAuth tokens are stored in system keychain
jiratown setup
```

## Basic Usage

### Start the Dashboard

```bash
# In your project directory
cd /path/to/your-project
jiratown

# Show all tickets across all repos
jiratown --all
```

### Add a Ticket

Press `+` or `n` to open the new ticket modal, then enter:
- A Jira ticket key: `AM-123`
- Or a Jira URL: `https://company.atlassian.net/browse/AM-123`

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` / `n` | Add new ticket |
| `Tab` | Switch between tickets |
| `e` | Escalate to Jira |
| `a` | Switch agent |
| `j` | Open ticket in Jira |
| `p` | View PR in browser |
| `x` | Close ticket tab |
| `r` | Resume blocked agent |
| `?` | Help |
| `q` | Quit |

## Programmatic Usage

### Basic Bootstrap

```typescript
import { bootstrap } from "@jiratown/core";
import { jiraPlugin } from "@jiratown/plugin-jira";
import { githubPlugin } from "@jiratown/plugin-github";
import { piAdapterPlugin } from "@jiratown/plugin-pi-adapter";

const jt = await bootstrap({
  repoRoot: process.cwd(),
  plugins: [jiraPlugin, githubPlugin, piAdapterPlugin],
});

// Parse a ticket
const issue = await jt.tracker.parseInput("AM-123");

// Spawn an agent
const adapter = await jt.orchestrator.spawn({
  issue,
  repoPath: process.cwd(),
  baseBranch: "main",
});

await adapter.start();

// Later: shutdown
await jt.shutdown();
```

### Custom Plugin

```typescript
import { definePlugin, useJiratown } from "@jiratown/core";

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },
  setup() {
    const { hooks } = useJiratown();
    
    hooks.on("issue.status_changed", ({ issue, from, to }) => {
      console.log(`${issue.externalId}: ${from} → ${to}`);
    });
  },
});
```

## Workflow Overview

1. **Add Ticket** → Jiratown fetches ticket details via Atlassian MCP
2. **Spawn Agent** → Agent starts in isolated git worktree
3. **Work Progress** → Real-time updates as agent works
4. **Jira Sync** → Comments, status changes, PR links
5. **PR Creation** → Agent opens pull request via GitHub MCP
6. **Review Handling** → Agent addresses reviewer comments
7. **Completion** → PR merged, Jira ticket → Done

## Agent States

| Status | Description |
|--------|-------------|
| `pending` | Ticket just entered, awaiting fetch |
| `queued` | Ready for agent |
| `planning` | Agent is analyzing |
| `implementing` | Agent is writing code |
| `blocked` | Agent needs clarification |
| `in_review` | PR under review |
| `done` | PR merged |

## Troubleshooting

### "Jira cloud ID is not configured"

Run `jiratown setup` or add to your config:

```toml
[plugins.jira]
cloud_id = "yourcompany.atlassian.net"
```

### Agent Not Starting

1. Check Pi Coding Agent is authenticated: `pi /login`
2. Verify model is available: Check model registry
3. Check worktree path exists and has permissions

### Notifications Not Appearing

1. Verify monitor is running: Check `monitor.tick` events
2. Check poll interval isn't too long
3. Verify source ID is unique (notifications dedupe by `sourceId`)

## Next Steps

- Read [PACKAGES.md](./PACKAGES.md) for detailed package documentation
- Check [PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md) for creating custom plugins
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details
