# Jiratown

A terminal UI dashboard for orchestrating multiple AI coding agents working on Jira tickets simultaneously.

Built with [OpenTUI](https://github.com/anomalyco/opentui) + [Solid.js](https://solidjs.com), powered by [Gas Town](https://github.com/steveyegge/gastown) for multi-agent coordination.

## Features

- **Multi-ticket dashboard**: Work on multiple Jira tickets simultaneously in separate tabs
- **Multi-agent support**: Use OpenCode or Claude Code for each ticket
- **Real-time progress**: Stream agent activity and see live updates
- **Jira sync**: Automatic comments, status transitions, and PR links
- **Non-blocking notifications**: Know when agents are blocked without interrupting your flow
- **Context-aware**: Auto-detects repo from git remote, shows only that repo's tickets

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

| Key       | Action                            |
| --------- | --------------------------------- |
| `+` / `n` | Add new ticket                    |
| `Tab`     | Switch between tickets            |
| `e`       | Escalate (post questions to Jira) |
| `a`       | Switch agent (OpenCode ↔ Claude)  |
| `j`       | Open ticket in Jira               |
| `p`       | View PR in browser                |
| `g`       | Open PR on GitHub                 |
| `x`       | Close ticket tab                  |
| `r`       | Resume blocked agent              |
| `c`       | Reply only to PR comment          |
| `A`       | Address all PR review comments    |
| `?`       | Help                              |
| `q`       | Quit                              |

### Configuration

Global configuration is stored in `~/.jiratown/config.toml`:

```toml
[jira]
cloud_id = "yourcompany.atlassian.net"

[defaults]
agent = "opencode" # or "claude"
```

Projects can optionally override settings with a `.jiratown.toml` in the git root:

```toml
# .jiratown.toml (project-specific, optional)
[jira]
cloud_id = "differentcompany.atlassian.net" # Different Jira instance

[defaults]
agent = "claude" # This project prefers Claude
```

Project config merges with global config, with project values taking precedence.

### Rig Detection

Jiratown automatically detects the current repository from your git remote URL. No manual configuration needed - just run `jiratown` in any git repository and it will:

1. Detect the git remote (e.g., `github.com/user/repo`)
2. Filter tickets to show only those for the current repo
3. Associate new tickets with the current repo

## How It Works

1. **Run in a git repo** → Jiratown auto-detects the repo from git remote
2. **You enter a Jira ticket** → Jiratown fetches ticket details via Atlassian MCP
3. **Creates a Bead** → Gas Town's work unit, linked to the Jira ticket
4. **Spawns an agent** → OpenCode or Claude Code in an isolated git worktree
5. **Streams progress** → Real-time updates as the agent works
6. **Syncs to Jira** → Comments, status changes, PR links
7. **Creates PR** → Agent pushes changes and opens a pull request via GitHub MCP
8. **Handles reviews** → Agent drafts replies to reviewer comments, you approve/edit
9. **Iterates on feedback** → Agent addresses change requests in combined commits
10. **Completes** → PR merged, Jira ticket transitioned to Done

## PR Review Workflow

When your agent creates a PR and reviewers request changes:

1. **Review comments appear** → Jiratown polls for new PR reviews via GitHub MCP
2. **Agent drafts replies** → Each comment gets an auto-generated response
3. **You review & edit** → Approve, modify, or add guidance to the draft
4. **Choose action**:
   - **Reply Only** (`c`) → Post the comment without code changes
   - **Reply + Address** (`A`) → Agent implements fixes, pushes a single commit, and replies with commit reference
5. **Re-request review** → Automatically request re-review after changes

```
┌─ Comment 1 ─────────────────────────────────────────────┐
│ @reviewer1: "Consider using exponential backoff"        │
│                                                         │
│ Draft Reply:                                            │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Good suggestion! I'll update the retry logic.       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Your input (optional):                                  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Use base 2, max 30s cap                             │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [c] Reply Only    [a] Reply + Address with Changes      │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
# Clone the repo
git clone https://github.com/StevenJPx2/jiratown
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
