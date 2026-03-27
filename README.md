# Jiratown

A terminal UI dashboard for orchestrating multiple AI coding agents working on Jira tickets simultaneously.

Built with [OpenTUI](https://github.com/anomalyco/opentui) + [Solid.js](https://solidjs.com), powered by [Gas Town](https://github.com/steveyegge/gastown) for multi-agent coordination.

## Features

- **Multi-ticket dashboard**: Work on multiple Jira tickets simultaneously in separate tabs
- **Multi-agent support**: Use OpenCode or Claude Code for each ticket
- **Real-time progress**: Stream agent activity and see live updates
- **Jira sync**: Automatic comments, status transitions, and PR links
- **Non-blocking notifications**: Know when agents are blocked without interrupting your flow
- **Context-aware**: Shows only current repo's tickets when run from a repo

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- [Gas Town](https://github.com/steveyegge/gastown) (`gt` CLI)
- [Beads](https://github.com/steveyegge/beads) (`bd` CLI)
- [OpenCode](https://opencode.ai) and/or [Claude Code](https://claude.ai/code)

## Installation

```bash
# Coming soon
bun install -g jiratown
```

## Quick Start

```bash
# First-time setup
jiratown setup

# Start dashboard in a repo (shows only that repo's tickets)
cd /path/to/your-project
jiratown

# Start dashboard with all tickets across all repos
jiratown --all

# Quick add a ticket
jiratown add AM-123
```

## Usage

### Adding a Ticket

Press `+` or `n` to open the new ticket modal. Enter a Jira ticket key (e.g., `AM-123`) or paste a full Jira URL.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` / `n` | Add new ticket |
| `Tab` | Switch between tickets |
| `e` | Escalate (post questions to Jira) |
| `a` | Switch agent (OpenCode ↔ Claude) |
| `j` | Open ticket in Jira |
| `p` | View PR |
| `x` | Close ticket tab |
| `r` | Resume blocked agent |
| `?` | Help |
| `q` | Quit |

### Configuration

Configuration is stored in `~/.jiratown/config.toml`:

```toml
[jira]
cloud_id = "yourcompany.atlassian.net"

[defaults]
agent = "opencode"  # or "claude"

[[rigs]]
name = "myproject"
path = "/Users/you/code/myproject"
jira_project_key = "AM"
```

## How It Works

1. **You enter a Jira ticket** → Jiratown fetches ticket details via Atlassian MCP
2. **Creates a Bead** → Gas Town's work unit, linked to the Jira ticket
3. **Spawns an agent** → OpenCode or Claude Code in an isolated git worktree
4. **Streams progress** → Real-time updates as the agent works
5. **Syncs to Jira** → Comments, status changes, PR links

## Development

```bash
# Clone the repo
git clone https://github.com/your-org/jiratown
cd jiratown

# Install dependencies
bun install

# Run in development
bun run dev

# Build
bun run build
```

## Architecture

See [PLAN.md](./PLAN.md) for detailed architecture documentation.

## License

MIT
