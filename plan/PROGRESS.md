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
| 9 | Harness | ⬜ Pending | Empty stub |
| 10 | MCP | ⬜ Pending | Empty stub |
| 11 | Jira Plugin | ⬜ Pending | |
| 12 | GitHub Plugin | ⬜ Pending | |

## After Core
- [ ] Integration testing
- [ ] REPL
- [ ] TUI