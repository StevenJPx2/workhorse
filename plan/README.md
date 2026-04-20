# Jiratown Rewrite — Build Plan

Stateful modules are classes. Stateless logic is plain functions. Dependencies only flow downward.

## Build Order

| Step | Module | Depends On | New Deps |
|------|--------|------------|----------|
| [0](./00-prerequisites.md) | Monorepo Scaffold | — | `zod` |
| [1](./01-config.md) | Config | Step 0 | `smol-toml`, `defu`, `string-ts`, `keytar` |
| [2](./02-types.md) | Types | Steps 0–1 | — |
| [3](./03-hooks.md) | Hooks | Step 2 | `mitt` |
| [4](./04-plugins.md) | Plugins | Steps 1–3 | — |
| [5](./05-database.md) | Database | Step 2 | — (`bun:sqlite`) |
| [6](./06-memory-service.md) | MemoryService | Steps 2, 3, 5 | `retriv`, `sqlite-vec`, `@huggingface/transformers` |
| [7](./07-monitor-service.md) | MonitorService | Steps 2, 3, 6 | — |
| [8](./08-issue-provider.md) | IssueProvider | Steps 2, 3, 5, 6 | — |
| [9](./09-agent-adapter.md) | AgentAdapter | Steps 2–8 | — |
| [10](./10-mcp-server.md) | MCP Server | Steps 2, 3, 5, 6 | `@modelcontextprotocol/sdk` |
| [11](./11-jira-plugin.md) | Jira Plugin | Steps 0–10 | `mcp-remote` (external) |
| [12](./12-github-plugin.md) | GitHub Plugin | Steps 0–10 | `gh` CLI (external) |

## Key Decisions

| Decision | Choice |
|----------|--------|
| Config | TOML, cascading merge (global → project), plugin-extensible |
| Database | `issues` table with `source` column (renamed from `tickets`) |
| Cache | L1 ralph-style context.md + L2 retriv (BM25 + vector), `all-MiniLM-L6-v2` |
| Hooks | `mitt` (~200b) — raw, no wrapper, sync fire-and-forget, let errors throw |
| Notifications | Push-based, not poll-based. Initial prompt bundles pending. New ones pushed via hook → `sendMessage`. |
| Plugins | Jiratown-native manifest, translated by AgentAdapter to native harness format |
| Monorepo | Bun workspaces, `packages/core` + `packages/plugins/*` |
| Testing | Bun test, unit tests first |

## After Core

1. Integration testing — full flow: parse → spawn → poll → notify → PR → review
2. REPL — interactive test harness
3. TUI — user interface (separate package)

## Reference

- [MIGRATION.md](../MIGRATION.md) — old → new mapping
- [architecture.d2](../architecture.d2) — diagram source
