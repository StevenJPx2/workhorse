# Jiratown Rewrite — Progress

| Step | Module | Status | Notes |
|------|--------|--------|-------|
| 0 | Monorepo Scaffold | ✅ Done | |
| 1 | Config | ✅ Done | |
| 2 | Types | ✅ Done | |
| 3 | Hooks | ✅ Done | `mitt` + `HookEventMap` + tests |
| 4 | Plugins | ✅ Done | `unctx` + `definePlugin()` + `PluginRegistry` + builtin sample plugin |
| 5 | Database | ✅ Done | Drizzle ORM + better-sqlite3, schema-derived types |
| 6 | MemoryService | ✅ Done | L1 (context.md) + L2 (retriv) + notifications + events |
| 7 | MonitorService | ✅ Done | Polling framework + agent health stub |
| 8 | Tracker | ✅ Done | Issue parsing + prompt building |
| 9 | Harness | ✅ Done | AgentAdapter abstract class, pluggable adapters via plugins, Pi adapter plugin, spawn/stop flow, Orchestrator with registerAdapter |
| 10 | MCP | ✅ Merged into Step 9 | Superseded by `OrchestratorTool` + `Adapter` pattern. Each adapter translates tools to its native harness (Pi uses Extension API, Claude Code uses `.mcp.json`, etc.). No standalone MCP server needed in core. |
| 11 | Jira Plugin | ✅ Done | Built-in plugin at `packages/core/src/plugins/builtin/jira/` |
| 12 | GitHub Plugin | ✅ Done | `workhorse-plugin-github` at `packages/plugins/github/` |
| 13 | Idle Steering & Plugin Hooks | ✅ Done | Plugin hooks for cross-plugin coordination + idle steering reminders |
| 14 | CLI | ⬜ Pending | `@fdcn/workhorse` — commander-based CLI |
| 15 | TUI | ⬜ Pending | `@fdcn/workhorse` — Ink-based terminal UI |
| 16 | Consolidate Spawn Logic | ✅ Done | `AgentAdapter` owns lifecycle, orchestrator is registry/factory |
| 17 | SteeringRule Class | ✅ Done | Autonomous `SteeringRule` class, removed `SteeringService` |

## After Core
- [ ] Integration testing
