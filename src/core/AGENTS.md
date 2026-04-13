# Agent Instructions — `src/core`

This file contains guidance for AI coding agents working inside the `src/core` module.

---

## What This Module Is

`src/core` is the **pure business-logic SDK** for Jiratown.  
It has no UI dependencies whatsoever — no OpenTUI, no Solid.js, no DOM.

If you are adding a feature that fetches data, manages state, runs a process, or interacts with an external service, it belongs **here**, not in `src/tui` or `src/cli`.

---

## The Golden Rule

> **`src/core` must never import from `src/tui` or `src/cli`.**

If you find yourself writing `import ... from '../../tui/...'` inside `src/core`, stop. Extract the shared type into `src/types/` or redesign the interface so the dependency flows correctly (core → tui, not tui → core).

---

## Directory Quick Reference

| Directory | What it contains | When to touch it |
|---|---|---|
| `db/` | SQLite CRUD + migrations | Adding/changing stored fields, new tables |
| `config/` | TOML load/save/merge | New config fields, new config file paths |
| `git/` | Rig detection | Changing how repos are identified |
| `session/tmux/` | tmux session management | tmux command changes |
| `session/worktree/` | git worktree management | Branch naming, worktree path strategy |
| `session/session-memory.ts` | `.jiratown/context.md` persistence | Agent context format changes |
| `agent/orchestrator/` | Agent boot + lifecycle | New agents, new MCP config, prompt changes |
| `agent/orchestrator/opencode-client/` | OpenCode HTTP SDK wrapper | OpenCode API version changes |
| `notifications/` | Notification CRUD + system instructions | New notification types or priorities |
| `pollers/` | Background polling loops | New polling sources (e.g., Linear, GitHub Actions) |
| `mcp-server/` | Embedded MCP server for agents | New tools agents can call |
| `clipboard.ts` | Cross-platform clipboard | Clipboard platform support |

---

## Adding a New Database Field

1. Add the column to the appropriate migration file in `db/migrations/`.  
   Migrations are `ALTER TABLE ... ADD COLUMN` (SQLite safe to add, not remove).
2. Update the TypeScript type in `src/types/ticket.ts` (or `config.ts`).
3. Update the relevant CRUD functions (`tickets.ts`, `ticket-updates.ts`).
4. Re-export from `db/index.ts` and `core/index.ts` if it's a new function.
5. Write a test in `db/tickets.test.ts` covering the new field.

---

## Adding a New MCP Tool (for agents)

Agents call tools exposed by the Jiratown MCP server. Adding a new tool:

1. Add the tool name to `mcp-server/tool-names.ts`.
2. Add the Zod input schema to `mcp-server/tool-definitions.ts`.
3. Create `mcp-server/tools/my-tool.ts` with a `handleMyTool(db, ticketId, input)` function.
4. Export it from `mcp-server/tools/index.ts`.
5. Register the tool in `mcp-server/server.ts` inside `createJiratownServer`.
6. Add types to `mcp-server/types.ts`.
7. Write tests in `mcp-server/tools/my-tool.test.ts`.
8. Export from `core/index.ts`.

---

## Adding a New Poller

Pollers follow a factory-function pattern. To add a new poller:

1. Create `pollers/my-source-poller.ts`.
2. Define `MySourcePollerOptions extends BasePollerOptions` with a `fetchX` function parameter.
3. Implement the `createMySourcePoller(options) => Poller<MySourcePollResult>` factory.
4. Export types from `pollers/types.ts`.
5. Export the factory from `pollers/index.ts` and `core/index.ts`.
6. Write tests in `pollers/my-source-poller.test.ts`.

The poller must inject `createNotification` (or accept it as a parameter for testability) to persist discoveries.

---

## Agent Spawn Sequence — Must Read Before Touching `agent/orchestrator/`

The spawn sequence in `spawn-agent.ts` is carefully ordered. Any step failure must roll back prior steps. The current order is:

```
1. Guard: check no existing running agent
2. createAgentInstance → update state to "starting"
3. createWorktree (repoPath, ticketId, issueType, baseBranch)
4. generateMcpConfig + writeMcpConfig → .opencode/opencode.json in worktree
5. killSession (if stale tmux session exists)
6. createSession (ticketId, worktree.path)
7. prepareAgentPrompt (context-aware, uses Jira data + session memory)
8. buildAgentCommand (opencode --port <N> --prompt '...') or "claude"
9. sendKeys → tmux send-keys to session
10. updateAgentState("running")
```

If you add a step, ensure it rolls back cleanly on failure (look at how `removeWorktree` + `killSession` are called in the catch/failure paths).

---

## OpenCode Port Management

Each OpenCode agent gets a unique TCP port so Jiratown can communicate with it via the `@opencode-ai/sdk`. Ports are managed by `agent/orchestrator/opencode-client/port-manager.ts`.

- Base port: `3100`
- Tickets are hashed to a stable port via `getPortForTicket(ticketId)`.
- Release the port in `stopAgent` / on agent crash.
- Do **not** hardcode ports anywhere else.

---

## Session Memory Format

The `.jiratown/context.md` file is a markdown document with YAML frontmatter:

```markdown
---
ticket_id: AM-123
status: implementing
agent: opencode
branch: feat/AM-123
started_at: 2024-01-15T09:00:00.000Z
last_updated: 2024-01-15T12:00:00.000Z
---

## Session Summary
Working on the authentication retry logic.

## Recent Activity
- [2024-01-15T09:05:00.000Z] Created feature branch
- [2024-01-15T09:10:00.000Z] Modified src/auth.ts

## Key Decisions
- Use exponential backoff with base 2, max 30s
```

**Do not change this format** without also updating `session-parser.ts` (which parses it) and `session-memory.ts` (which writes it). The resume system prompt reads this file verbatim.

---

## Notification Deduplication

`createNotification` deduplicates on `(source_type, source_id)`. Before inserting, it checks for an existing notification with the same source. If found:
- If status is `acknowledged`, it resets to `unread` and updates content.
- If status is `unread` or `read`, it updates content and re-marks as `unread`.

This prevents duplicate notifications when pollers run repeatedly for the same comment.

---

## Testing Patterns

### In-memory database for tests

```ts
import { Database } from "bun:sqlite";
import { migrateTickets } from "../db/migrations/tickets.ts";
import { migrateNotifications } from "../db/migrations/notifications.ts";

const db = new Database(":memory:");
migrateTickets(db);
migrateNotifications(db);
```

### Resetting the database singleton

```ts
import { resetDatabaseRef } from "../db/connection.ts";

afterEach(() => {
  resetDatabaseRef();
});
```

### Mocking shell commands (tmux/git)

Use `vi.mock` (or Bun's equivalent) to stub shell execution. For functions that use `$` from `bun`, mock the module at the boundary:

```ts
vi.mock("../../session/tmux/tmux-operations.ts", () => ({
  createSession: vi.fn().mockResolvedValue({ name: "jt-TEST-1", path: "/tmp" }),
  // ...
}));
```

### Injecting test dependencies into pollers

```ts
const poller = createJiraPoller({
  db,
  ticketId: "TEST-1",
  interval: 100,
  fetchComments: async () => [{ id: "c1", author: "alice", body: "hi", created: "..." }],
  onNewComments: (c) => received.push(c),
});
```

---

## Coverage Requirement

**97% code coverage is required** across all files in this module.

Before committing:

```bash
bun run coverage
```

If coverage drops below threshold, `bun run check` will fail. Every new function, branch, and error path must have a corresponding test case.

---

## Common Mistakes to Avoid

1. **Importing from `src/tui`** — Core is UI-free. Use `src/types/` for shared types.
2. **Hardcoding paths** — Always use `getConfigPaths()` or `getContextPath()` for file locations.
3. **Opening the database without init** — Call `initDatabase()` once at startup, then use `getDatabase()`. Never construct `new Database()` directly in feature code.
4. **Forgetting to export from `core/index.ts`** — All public APIs must be exported from the barrel. Consumers import from `'../core/index.ts'`, not from deep paths.
5. **Mutable global state in pollers** — Pollers use closures for state (`let state`, `let intervalId`). This is intentional. Do not convert to module-level variables.
6. **Skipping rollback on spawn failure** — The spawn sequence must clean up on every failure branch. Check `spawn-agent.ts` for the pattern.
