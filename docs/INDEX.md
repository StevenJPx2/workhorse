# Jiratown Documentation Index

This document serves as a comprehensive index of all documentation available in the Jiratown project.

## Quick Links

| Document | Purpose | Location |
|----------|---------|----------|
| [Quick Start](./QUICK-START.md) | Get up and running quickly | `docs/QUICK-START.md` |
| [Packages](./PACKAGES.md) | Comprehensive package documentation | `docs/PACKAGES.md` |
| [API Reference](./API-REFERENCE.md) | Complete API documentation | `docs/API-REFERENCE.md` |
| [Plugin Development](./PLUGIN-DEVELOPMENT.md) | Create custom plugins | `docs/PLUGIN-DEVELOPMENT.md` |
| [Steering Guide](./STEERING-GUIDE.md) | Autonomous agent guidance | `docs/STEERING-GUIDE.md` |
| [Troubleshooting](./TROUBLESHOOTING.md) | Diagnose and fix issues | `docs/TROUBLESHOOTING.md` |

## Project Overview

### Main README
- **[README.md](../README.md)** - Project overview, features, installation, and usage

### Architecture
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - Complete system architecture and code flow documentation
  - Three-layer architecture (CLI, TUI, Core)
  - Directory structure
  - Data flow diagrams
  - Subsystem documentation
  - Agent lifecycle
  - External integrations

### Planning & Progress
- **[PLAN.md](../PLAN.md)** - Detailed implementation planning document
- **[CONTEXT.md](../CONTEXT.md)** - AI agent context information
- **[CODE_QUALITY.md](../CODE_QUALITY.md)** - Code quality standards and practices
- **[AGENTS.md](../AGENTS.md)** - Agent instructions and guidelines

---

## Package Documentation

### @jiratown/core (Main Package)

The core package is documented in `docs/PACKAGES.md` and in its internal README:

- **[src/core/README.md](../src/core/README.md)** - Core SDK business logic documentation
  - Module map
  - Database subsystem
  - Configuration management
  - Git/Rig detection
  - Session management (tmux + worktrees)
  - Agent orchestration
  - Notifications
  - Pollers
  - MCP Server
  - Public API reference

**Key modules documented:**
| Module | Description |
|--------|-------------|
| `db/` | SQLite persistence layer |
| `config/` | TOML configuration management |
| `git/` | Git remote detection |
| `session/` | tmux + worktree management |
| `agent/orchestrator/` | Agent lifecycle management |
| `notifications/` | Notification store & system instructions |
| `pollers/` | Background polling loops |
| `mcp-server/` | Embedded MCP server for agents |

### @jiratown/tui (Terminal UI)

- **[src/tui/README.md](../src/tui/README.md)** - TUI layer documentation
  - Module map
  - Provider stack architecture
  - Component reference
  - Hooks reference
  - Theme system
  - Context reference
  - Keyboard architecture
  - Sandbox testing

**Component READMEs:**
- `src/tui/components/command-palette/README.md` - Command palette documentation

**Hook READMEs:**
- `src/tui/hooks/use-atlassian/README.md` - Atlassian MCP client hook
- `src/tui/hooks/use-command-palette/README.md` - Command palette state
- `src/tui/hooks/use-command-filter/README.md` - Command filtering
- `src/tui/hooks/use-interactive/README.md` - Interactive mode handling

### @jiratown/cli (Command Line Interface)

- **[src/cli/README.md](../src/cli/README.md)** - CLI layer documentation
  - Entry point structure
  - Command reference (`jiratown`, `setup`, `add`, `cleanup`)
  - Dependency checking
  - Atlassian authentication
  - Ticket key parsing
  - Error handling conventions

---

## Plugin Documentation

All plugins are documented in `docs/PACKAGES.md` under their respective sections:

### @jiratown/plugin-jira
- Issue parsing for Jira ticket keys and URLs
- Comment monitoring
- Status sync (Jiratown → Jira transitions)
- Tools: `jira_add_comment`, `jira_transition_issue`, `jira_get_comments`
- Steering rules for comment response
- Cross-plugin sync with GitHub

### @jiratown/plugin-github
- Issue/PR parsing for `owner/repo#num` and URLs
- Unified PR monitor (reviews, comments, CI, mergeable state)
- Status sync (Jiratown → GitHub labels)
- Tools: `github_open_pr`, `github_add_comment`, `github_get_pr_status`
- Steering rules for PR reviews and CI failures
- PR enhancement via `github:pr.opening` hook

### @jiratown/plugin-playwright
- Browser automation via Playwright
- Session management (one per issue)
- Tools: `playwright_navigate`, `playwright_screenshot`, `playwright_click`, `playwright_fill`, `playwright_get_element`, `playwright_get_page_content`, `playwright_evaluate`, `playwright_close_session`
- Cross-plugin sync (auto-add screenshots to PRs)
- Steering rules for screenshot reminders

### @jiratown/plugin-pi-adapter
- Pi Coding Agent adapter
- Model registry integration
- Tool translation to Pi Extension API
- Event mapping to Jiratown hooks
- Streaming support via `session.steer()`

---

## Development Guides

### Plugin Development
- **[docs/PLUGIN-DEVELOPMENT.md](./PLUGIN-DEVELOPMENT.md)** - Complete plugin development guide
  - Plugin basics and structure
  - Configuration schemas
  - Accessing services
  - Registering capabilities (parsers, tools, monitors, steering)
  - Hook-based communication
  - Testing plugins
  - Publishing plugins
  - Best practices

### Steering Rules
- **[docs/STEERING-GUIDE.md](./STEERING-GUIDE.md)** - Comprehensive steering guide
  - How steering works
  - Creating rules
  - Condition filters (status, source, hook, when)
  - Reminder functions
  - Configuration
  - Built-in rules
  - Debugging
  - Best practices

### Troubleshooting
- **[docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Troubleshooting guide
  - Setup issues
  - Agent issues
  - Jira integration
  - GitHub integration
  - Database issues
  - Plugin issues
  - Steering issues
  - Performance issues
  - Debug logging

---

## API Reference

- **[docs/API-REFERENCE.md](./API-REFERENCE.md)** - Complete API reference
  - Core package APIs
  - Plugin system
  - Database operations
  - Memory service
  - Monitor service
  - Orchestrator
  - Tracker
  - Hooks
  - Configuration
  - Git operations
  - Types reference

Comprehensive API reference is available in `docs/PACKAGES.md`:

### Core Exports
- `bootstrap(options)` - Initialize Jiratown instance
- `useJiratown()` / `tryUseJiratown()` - Context access
- `runWithContext(ctx, fn)` - Execute with context
- `definePlugin(options)` - Create plugins
- `Database` - Database class
- `MemoryService` - Memory service
- `MonitorService` - Monitor service
- `HarnessOrchestrator` - Orchestrator
- `AgentAdapter` / `ModelRegistry` - Adapter base classes
- `SteeringRule` - Steering rule class
- `Tracker` - Issue parsing
- `hooks` - Global hook emitter
- `createWorktree` / `removeWorktree` - Git operations

### Type Exports
- `Jiratown`, `BootstrapOptions` - Bootstrap types
- `JiratownConfig`, `ConfigPaths` - Config types
- `Plugin`, `PluginManifest` - Plugin types
- `OrchestratorTool`, `ToolExecutionContext`, `ToolResult` - Tool types
- `AgentState`, `ModelInfo` - Agent types
- `SteeringRuleConfig`, `SteeringCondition`, `SteeringContext` - Steering types
- `MonitorOptions`, `MonitorContext`, `MonitorResult` - Monitor types
- `IssueParserOptions`, `ParsedIssue` - Parser types
- `SessionMemory`, `MemoryDocument`, `SearchResult` - Memory types
- `HookEventMap`, `PromptContextBlock` - Hook types

---

## Testing Documentation

### TUI Testing
- **[src/tui/sandbox/README.md]** - Sandbox testing environment
- Headless terminal testing with `ht` (headless-terminal)

### Running Tests
```bash
# Run all tests
bun test

# Run specific package tests
bun test src/core
bun test src/tui
bun test src/cli

# Run with coverage
bun run coverage
```

---

## Configuration Reference

### Config Files
| File | Scope |
|------|-------|
| `~/.jiratown/config.toml` | Global user config |
| `.jiratown.toml` | Project-specific overrides |
| `~/.jiratown/jiratown.db` | SQLite database |

### Config Schema
```toml
[jira]
cloud_id = "company.atlassian.net"

[defaults]
agent = "opencode"  # or "claude"

[ui]
theme = "tokyonight"  # or "gruvbox", "default"

[behavior]
auto_resume = true

[prompt]
custom = """
Project-specific instructions.
"""
```

---

## External Resources

- [OpenTUI](https://github.com/anomalyco/opentui) - Terminal UI framework
- [Solid.js](https://solidjs.com) - Reactive UI library
- [Atlassian MCP](https://mcp.atlassian.com) - Jira API integration
- [Model Context Protocol](https://github.com/anthropics/mcp-sdk) - Agent communication
- [Pi Coding Agent](https://github.com/mariozechner/pi-coding-agent) - AI coding agent

---

## Document Maintenance

When adding new documentation:

1. Add the document to the appropriate location
2. Update this index file
3. Ensure cross-references are correct
4. Follow the 200-line limit for source files
5. Include examples and code snippets
