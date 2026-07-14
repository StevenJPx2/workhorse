# Workhorse: Pipeline → Architecture Migration Reference

## Overview

This document maps the existing Workhorse pipeline (on `main`) into the new architecture defined in `architecture.d2`. It serves as the canonical reference for the rewrite.

---

## Architecture Summary

- **Entry point**: Tracker (via TUI — modal, chatbox, etc.)
- **Workflow**: Harness + Services (MemoryService, MonitorService)
- **Harness**: Wraps Claude Code or Opencode, generates native plugin config for whichever harness is used
- **Agent Plugin**: The config surface defined in the Harness — maps to Claude Code's `plugin.json` / Opencode's JS/TS plugin modules
- **Plugins**: Developer-defined extensions (Jira, GitHub, etc.) that hook into every part of Workhorse via dashed-line hook access
- **TUI**: Just the interface layer to this underlying system — can be a modal, chatbox, whatever

---

## 1. Tracker (was IssueProvider)

| New Component          | Current Code (main branch)                                                                                                                    | What Changes                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User-Prompt Parser** | `parseTicketKey()` + CLI/TUI input handling + `AtlassianClient.fetchIssue()`                                                                  | Becomes a generic parser — no longer Jira-specific. The _Jira Plugin_ registers a parser that knows how to handle Jira ticket keys/URLs. A GitHub Plugin could register one that handles issue URLs. |
| **Prompt Engineer**    | `prepareAgentPrompt()`, `generateInitialPrompt()`, `generateResumePrompt()`, `generateSystemPrompt()` — all in `src/core/agent/orchestrator/` | Stays mostly the same, but receives context from MemoryService (the `←` arrow) instead of directly reading `context.md` and making its own Jira/GitHub API calls.                                    |

**Key shift**: The Tracker becomes **source-agnostic**. It doesn't know about Jira or GitHub — it just receives structured issue data from whatever plugin parsed the input, and engineers a prompt from it. GitHub can now also plug into the Tracker to parse GitHub issue IDs/URLs (was too complicated to do before with the old architecture — the new plugin-based parser registration makes this trivial).

---

## 2. Workflow → Harness → Agent Plugin

The Agent Plugin is what Workhorse defines in the Harness. Each agent harness has its own native plugin system:

- **Claude Code**: `plugin.json` + `hooks.json` + `.mcp.json` + `skills/` + `agents/` + `monitors/` etc.
- **Opencode**: JS/TS plugin modules with event hooks, `tool()` definitions, etc.

| Agent Plugin Slot | Current Code                                                                                                                      | What Changes                                                                                                                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP**           | `createWorkhorseServer()` in `src/core/mcp-server/` + `generateMcpConfig()` writing `.opencode/opencode.json`                     | The harness generates the native MCP config for whichever agent harness. The 5 Workhorse tools (`get_notifications`, `acknowledge`, `update_status`, `escalate`, `open_pr`) become the core MCP server (now lives inside `harness/mcp/`). Jira/GitHub MCP connections move to their respective plugins.             |
| **Tools**         | The 5 tool handlers in `src/core/mcp-server/tools/`                                                                               | Core tools stay. Plugin-contributed tools get registered via hooks.                                                                                                                                                                                                                                                 |
| **Skills**        | System prompt instructions (hardcoded in `system-prompt/`)                                                                        | Become actual skill files — `SKILL.md` for Claude Code, or JS modules for Opencode.                                                                                                                                                                                                                                 |
| **Commands**      | N/A — no formal command system existed                                                                                            | Formalized as agent commands (slash commands, etc.).                                                                                                                                                                                                                                                                |
| **Hooks**         | `sendMessageToAgent()` via tmux `sendKeys()` for notification injection was the closest thing — but it was inline, not hook-based | **New** — the plugin hook system. This is the big addition. Autonomous notification delivery to the agent (currently `injectSystemInbox()` via tmux) becomes a hook that fires on notification events. Plugins and core services can register hooks to push messages to the agent at the right lifecycle moments.   |
| **LSPs**          | Doesn't exist yet                                                                                                                 | **New** — can be contributed by plugins.                                                                                                                                                                                                                                                                            |
| **Models**        | No model selection existed — the agent harness picked its own model                                                               | **New** — Refers to the actual LLM model (e.g. `opus-4-6`, `glm-5-1`, `sonnet-4`), not the coding harness. Workhorse plugins or config can now specify which model the agent should use. This is passed through to the native agent harness config (Claude Code's model setting, Opencode's provider/model config). |
| **Agents**        | Not applicable (single agent per ticket)                                                                                          | Could enable sub-agent definitions.                                                                                                                                                                                                                                                                                 |
| **Monitors**      | The pollers are outside the agent currently                                                                                       | Move into the agent plugin format (Claude Code `monitors.json`, Opencode events).                                                                                                                                                                                                                                   |
| **Dependencies**  | Not applicable                                                                                                                    | Plugin dependency resolution.                                                                                                                                                                                                                                                                                       |

**Key shift**: Currently `spawnAgent()` does everything — worktree, tmux, MCP config, prompt, command building. The Harness splits this into: (1) generate the Agent Plugin config in native format, (2) hand it to the agent harness. The tmux/spawning becomes an implementation detail of the adapter.

---

## 3. Workflow → Services → MemoryService

| New Component            | Current Code                                                              | What Changes                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — context.md**      | `session-memory.ts` reading/writing `.workhorse/context.md` per worktree  | Same concept, but accessed through the MemoryService API instead of direct file I/O. The Prompt Engineer reads from MemoryService, not from files directly.                                                                                                                                                                                                                                                                       |
| **L2 — retriv**          | Doesn't exist — every resume re-fetches from Jira/GitHub APIs             | **New** — Powered by [retriv](https://github.com/skilld-dev/retriv). Hybrid search (BM25 keyword + vector semantic via RRF fusion) over all indexed content: cached API reads, past session memories, key decisions, codebase context. SQLite + sqlite-vec locally, with `all-MiniLM-L6-v2` via transformersJs for embeddings (~30MB, no API key). AST-aware chunking for TS/JS code, camelCase tokenization, metadata filtering. |
| **System Events**        | `ticket_events` table + `insertTicketEvent()`                             | Stays, but becomes part of MemoryService's event bus. Other services subscribe to events instead of polling SQLite.                                                                                                                                                                                                                                                                                                               |
| **System Notifications** | `notification-store.ts`, `system-instruction.ts`, `generateSystemInbox()` | The notification system moves under MemoryService. Notifications are a type of system event. The `<system_inbox>` injection pattern stays.                                                                                                                                                                                                                                                                                        |

**Key shift**: Memory becomes **centralized with hybrid search**. L1 (`context.md`) is the fast per-worktree file for immediate session context. L2 (retriv) is the searchable store for everything else — cached API data, past sessions, decisions, code context — with both keyword and semantic search. Instead of `session-memory.ts` reading files, `notification-store.ts` hitting SQLite, and pollers re-fetching APIs independently — MemoryService owns all state and serves it through a unified API. The `←` arrow from MemoryService to Prompt Engineer replaces the current scattered context-gathering.

---

## 4. Workflow → Services → MonitorService

| New Component                    | Current Code                                                                  | What Changes                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Remote Polling**               | `jira-poller.ts`, `github-poller.ts`                                          | Move **out** of core and into their respective plugins. MonitorService provides the polling infrastructure (interval, health, lifecycle). Jira Plugin and GitHub Plugin register their pollers through hooks. |
| **Local File/Script Monitoring** | `notification-watcher.ts` (watches SQLite), `agent-poller.ts` (health checks) | `notification-watcher` becomes a core monitor (notification delivery, not plugin-specific). `agent-poller` (health checks) is core harness responsibility.                                                    |

**Key shift**: MonitorService provides the **framework** for monitoring. Plugins bring the **what** to monitor. Currently pollers are hardcoded — with hooks, any plugin can register a monitor.

---

## 5. Plugins (Developer-Defined, Hook-Based)

Plugins are defined by the developer **beforehand**. They have access to every part of Workhorse via hooks — that's what the dashed lines in the architecture diagram represent.

| Plugin            | Current Code                                                                              | What Changes                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jira Plugin**   | `src/core/jira/` (client, poller, fetch context, sync) — deeply integrated into core      | Extracted from core. Hooks into: Tracker (registers Jira ticket key/URL parser), MonitorService (registers Jira comment poller), MemoryService (provides Jira context for prompts), Harness (contributes Atlassian MCP server config).        |
| **GitHub Plugin** | `src/core/github/` (client, poller, PR context, formatters) — deeply integrated into core | Same extraction. Hooks into: **Tracker** (registers GitHub issue ID/URL parser — new capability!), MonitorService (PR review/comment poller), MemoryService (PR context), Harness (contributes GitHub MCP config), and MCP tools (`open_pr`). |

**Key shift**: Jira and GitHub are currently **baked into core** — `launchTicketAgent()` directly calls `fetchPRContext()`, the system prompt has hardcoded Jira/GitHub instructions, pollers are created inline. In the new architecture, they become **plugins that register themselves via hooks**. Core Workhorse has no knowledge of Jira or GitHub — it just knows about issues, monitors, memory, and agents.

---

## Existing Pipeline Stages → New Architecture

| #   | Current Pipeline Stage                                                           | New Architecture Location                                               |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **Input/Parsing**: Ticket key parsed → Jira API fetch → domain object            | **Tracker** → User-Prompt Parser (plugin-contributed parsers)           |
| 2   | **Provisioning**: Worktree created, tmux session, MCP config written             | **Harness** (implementation detail of the adapter)                      |
| 3   | **Prompt Engineering**: Session memory checked → initial/resume prompt generated | **Tracker** → Prompt Engineer ← **MemoryService** (context enrichment)  |
| 4   | **Agent Spawning**: Agent command built, sent to tmux                            | **Harness** (hands off to native agent harness)                         |
| 5   | **Agent Execution**: Agent works via MCP tools                                   | **Harness** → Agent Plugin (MCP, Tools, Skills)                         |
| 6   | **Monitoring**: Background pollers for health, Jira, GitHub                      | **MonitorService** (framework) + **Plugins** (register what to monitor) |
| 7   | **Notification Pipeline**: External events → SQLite → `<system_inbox>` injection | **MemoryService** (System Events + System Notifications)                |
| 8   | **Status Tracking**: Agent reports via `workhorse_update_status`                 | **MemoryService** (System Events) + core MCP tools                      |
| 9   | **PR Workflow**: Agent creates PR → GitHub poller starts → reviews → agent       | **GitHub Plugin** hooks into MonitorService + MemoryService             |
| 10  | **Completion**: Agent calls done → ticket marked complete                        | **MemoryService** (event) → Tracker or Plugins react via hooks          |

---

## The Big Picture

```
BEFORE (current):
  Everything is tangled in core/
  Jira/GitHub calls are inline in spawn, restart, prompt generation
  Pollers are created alongside agent spawning
  Memory is scattered (context.md + SQLite + fresh API calls)
  Only OpenCode is really supported (Claude is a stub)

AFTER (new architecture):
  Tracker: generic input → prompt (source-agnostic)
  Harness: generic agent config → native plugin format (agent-agnostic)
  MemoryService: tiered cache + events + notifications (centralized state)
  MonitorService: polling framework (plugin-contributed monitors)
  Plugins: Jira + GitHub register via hooks into all of the above
```

---

## Key Existing Files Reference (main branch)

### Core Pipeline

- `src/core/agent/orchestrator/spawn-agent.ts` — Agent spawning (worktree + tmux + prompt + command)
- `src/core/agent/orchestrator/prompt-builder.ts` — Initial vs resume prompt decision
- `src/core/agent/orchestrator/system-prompt/` — System, initial, and resume prompt generators
- `src/core/agent/orchestrator/mcp-config.ts` — MCP config generation + agent command building
- `src/core/agent/orchestrator/agent-store.ts` — In-memory agent state tracking
- `src/core/agent/orchestrator/health-check.ts` — Agent health monitoring
- `src/core/agent/orchestrator/orchestrator.ts` — Stop, message, capture, inject operations

### Workflow

- `src/core/workflow/ticket-agent/launch.ts` — Full ticket launch pipeline
- `src/core/workflow/ticket-agent/halt.ts` — Agent stopping
- `src/core/workflow/ticket-agent/restart.ts` — Resume with fresh context
- `src/core/workflow/ticket-agent/resume-all.ts` — Startup recovery

### Memory / Session

- `src/core/session/session-memory.ts` — `.workhorse/context.md` read/write (→ L1 cache)
- `src/core/session/worktree/` — Git worktree management
- `src/core/session/tmux/` — Tmux session management

### Notifications

- `src/core/notifications/notification-store.ts` — SQLite CRUD for notifications
- `src/core/notifications/system-instruction.ts` — `<system_inbox>` XML generation

### Pollers

- `src/core/pollers/jira-poller.ts` — Jira comment polling (→ Jira Plugin)
- `src/core/pollers/github-poller.ts` — GitHub PR review/comment polling (→ GitHub Plugin)
- `src/core/pollers/agent-poller.ts` — Agent health polling (→ core MonitorService)
- `src/core/pollers/notification-watcher.ts` — Notification delivery (→ core MonitorService)

### External Clients

- `src/core/jira/` — Atlassian MCP client (→ Jira Plugin)
- `src/core/github/` — GitHub MCP client (→ GitHub Plugin)

### MCP Server

- `src/core/mcp-server/server.ts` — The Workhorse MCP server agents connect to
- `src/core/mcp-server/tools/` — 5 tool handlers (get_notifications, acknowledge, update_status, escalate, open_pr)

### Database

- `src/core/db/` — SQLite (tickets, ticket_events, notifications tables)

### Config

- `src/core/config/` — TOML config loading, cascading merge, keychain
