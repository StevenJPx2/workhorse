# Workhorse Rewrite — Build Plan

Stateful modules are classes. Stateless logic is plain functions. Dependencies only flow downward.

## Module Layout

```
packages/core/src/
  lib/            ← shared across core modules
    db/
    hooks/
  workflow/       ← the orchestration pipeline
    tracker/      ← was issue-provider
    harness/      ← was agent-adapter
      mcp/        ← was mcp-server (harness-specific back-channel)
      claude-code/
      opencode/
    services/
      monitor/
      memory/
  config/
  plugins/
  types/
```

## Build Order

| Step                                  | Module                       | Depends On       | New Deps                                            | Location                                      |
| ------------------------------------- | ---------------------------- | ---------------- | --------------------------------------------------- | --------------------------------------------- |
| [0](./00-prerequisites.md)            | Monorepo Scaffold            | —                | `zod`                                               | —                                             |
| [1](./01-config.md)                   | Config                       | Step 0           | `smol-toml`, `defu`, `string-ts`, `keytar`          | `config/`                                     |
| [2](./02-types.md)                    | Types                        | Steps 0–1        | —                                                   | `types/`                                      |
| [3](./03-hooks.md)                    | Hooks                        | Step 2           | `mitt`                                              | `lib/hooks/`                                  |
| [4](./04-plugins.md)                  | Plugins                      | Steps 1–3        | —                                                   | `plugins/`                                    |
| [5](./05-database.md)                 | Database                     | Step 2           | — (`bun:sqlite`)                                    | `lib/db/`                                     |
| [6](./06-memory-service.md)           | MemoryService                | Steps 2, 3, 5    | `retriv`, `sqlite-vec`, `@huggingface/transformers` | `workflow/services/memory/`                   |
| [7](./07-monitor-service.md)          | MonitorService               | Steps 2, 3, 6    | —                                                   | `workflow/services/monitor/`                  |
| [8](./08-tracker.md)                  | Tracker                      | Steps 2, 3, 5, 6 | —                                                   | `workflow/tracker/`                           |
| [9](./09-harness.md)                  | Harness                      | Steps 2–8        | —                                                   | `workflow/harness/`                           |
| [10](./10-mcp.md)                     | MCP                          | Steps 2, 3, 5, 6 | `@modelcontextprotocol/sdk`                         | `workflow/harness/mcp/`                       |
| [11](./11-jira-plugin.md)             | Jira Plugin                  | Steps 0–10       | `mcp-remote` (external)                             | `plugins/`                                    |
| [12](./12-github-plugin.md)           | GitHub Plugin                | Steps 0–10       | `gh` CLI (external)                                 | `plugins/`                                    |
| [13](./13-idle-steering.md)           | Idle Steering & Plugin Hooks | Steps 9, 11, 12  | —                                                   | `workflow/orchestrator/steering/`             |
| [14](./14-cli.md)                     | CLI                          | Steps 0–13       | `commander`, `picocolors`, `ora`                    | `packages/cli/`                               |
| [15](./15-tui.md)                     | TUI                          | Steps 0–14       | `ink`, `react`, `zustand`                           | `packages/tui/`                               |
| [16](./16-consolidate-spawn-logic.md) | Consolidate Spawn Logic      | Steps 9, 15      | —                                                   | `workflow/orchestrator/`                      |
| [17](./17-steering-rule-class.md)     | Steering Rule Class          | Step 13          | —                                                   | `workflow/orchestrator/steering/`             |
| [18](./18-plugin-skills.md)           | Plugin Skills                | Steps 4, 8, 9    | —                                                   | `workflow/orchestrator/`, `plugins/*/skills/` |
| [19](./19-slack-plugin.md)            | Slack Plugin                 | Steps 0–10       | —                                                   | `packages/plugins/slack/`                     |
| [20](./20-server.md)                  | Server                       | Steps 0–13       | `nitro`, `h3`                                       | `packages/server/`                            |

## Key Decisions

| Decision      | Choice                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Config        | TOML, cascading merge (global → project), plugin-extensible                                           |
| Database      | `issues` table with `source` column (renamed from `tickets`)                                          |
| Cache         | L1 ralph-style context.md + L2 retriv (BM25 + vector), `all-MiniLM-L6-v2`                             |
| Hooks         | `mitt` (~200b) — raw, no wrapper, sync fire-and-forget, let errors throw                              |
| Notifications | Push-based, not poll-based. Initial prompt bundles pending. New ones pushed via hook → `sendMessage`. |
| Plugins       | Workhorse-native manifest, translated by Harness to native harness format                             |
| Monorepo      | Bun workspaces, `packages/core` + `packages/plugins/*`                                                |
| Testing       | Bun test, unit tests first                                                                            |

## Naming Map

| Old Name       | New Name | Location                |
| -------------- | -------- | ----------------------- |
| issue-provider | tracker  | `workflow/tracker/`     |
| agent-adapter  | harness  | `workflow/harness/`     |
| mcp-server     | mcp      | `workflow/harness/mcp/` |
| db             | db       | `lib/db/`               |
| hooks          | hooks    | `lib/hooks/`            |

## After Core

1. Integration testing — full flow: parse → spawn → poll → notify → PR → review
2. REPL — interactive test harness
3. TUI — user interface (separate package)

## Reference

- [MIGRATION.md](../MIGRATION.md) — old → new mapping
- [architecture.d2](../architecture.d2) — diagram source
