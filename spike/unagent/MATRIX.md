# Coding-agent capability matrix

Versions checked on 2026-10-27: OpenCode 2.1.4, Pi 1.4.0, Claude Code 2.1.310 and Codex 0.164.0. The citations for each cell are in [FINDINGS.md](FINDINGS.md) and [HARNESS-ADAPTERS.md](HARNESS-ADAPTERS.md). **(inferred)** marks a claim not confirmed against a primary source.

Legend:

- ✅ **native**: the harness does it.
- 🟡 **fallback**: a substitute, described in the cell.
- 🔵 **derived**: computed by the adapter from other events.
- ❌ **unsupported**.

Cells with no marker are descriptive.

Claude Code has two runtime columns:

- **mod**: in-process plugin code.
- **hooks**: external commands run at each hook.

Organizations can turn mods off, and the hooks keep working.

## 1. Install-time surfaces

The files are the same with or without mods, so Claude Code has one column here.

| Capability | OpenCode 2.1.4 | Pi 1.4.0 | Claude Code 2.1.310 | Codex 0.164.0 |
| --- | --- | --- | --- | --- |
| MCP server config | ✅ `mcp.servers` in `opencode.json(c)` | ✅ `~/.pi/agent/mcp.json`; `.pi/mcp.json` only after project trust | ✅ `.mcp.json`, `~/.claude.json` | ✅ `[mcp_servers]` in `config.toml`; project file only if trusted |
| AGENTS.md | ✅ yes | ✅ yes | 🟡 only when no CLAUDE.md exists | ✅ yes; 32 KiB combined cap |
| Skills on disk | ✅ `.opencode/skills`, `.claude/skills`, `.agents/skills` | ✅ `.pi/skills`, `.agents/skills` | ✅ `.claude/skills` only, not `.agents/skills` | ✅ `.agents/skills` |
| Skills over MCP (SEP-2640) | ❌ | ❌ | ❌ | ❌ |
| Commands | ✅ `.opencode/commands/*.md` | ✅ `.pi/prompts/*.md` | ✅ skills, or `.claude/commands` | ❌ deprecated |
| Subagent files | ✅ `.opencode/agents/*.md` | ❌ none in core | ✅ `.claude/agents/*.md` | 🟡 `.codex/agents/*.toml`; cannot set tools, sandbox or MCP |
| Plugin package | ✅ TS `Plugin.define`, from npm or Git | ✅ pi packages, from npm or Git | ✅ `.claude-plugin/plugin.json` | ✅ Agent Plugins `plugin.json` |
| Agent Plugins 1.0 format | ❌ | ❌ | ❌ | ✅ |
| Permission model | ✅ ordered allow, ask and deny rules | ❌ none; project trust only | ✅ allow, ask and deny rules; six modes | ✅ sandbox, approval policy and `.rules` |
| Headless run | ✅ `opencode run --format json` | ✅ `pi -p`, `--mode json`, `--mode rpc` | ✅ `claude -p --output-format stream-json` | ✅ `codex exec --json` |
| Structured output | ❌ not documented **(inferred)** | 🟡 a tool with `terminate: true` | ✅ `--json-schema` | ✅ `--output-schema` |
| ACP | ✅ `opencode acp` | 🟡 community `pi-acp` | 🟡 `claude-agent-acp` adapter | 🟡 `codex-acp` adapter |

## 2. Runtime events

| Event | OpenCode | Pi | Claude Code (mod) | Claude Code (hooks) | Codex |
| --- | --- | --- | --- | --- | --- |
| `session.created` | ✅ event `session.created` | ✅ `session_start` (`startup`, `new`, `fork`) | 🟡 `session.start` misses `/clear`, `/resume`, `/branch` | ✅ `SessionStart` | ✅ `SessionStart`, deferred to the first turn |
| `session.resumed` (reopened) | ❌ no event | ✅ `session_start` `resume` | 🟡 `classic.SessionStart` | ✅ `SessionStart` `resume` | ✅ `SessionStart` `resume`, deferred |
| `prompt.sent` | ✅ hook `session.prompt` | ✅ `input`, `before_agent_start` | ✅ `prompt.submit` | ✅ `UserPromptSubmit` | ✅ `UserPromptSubmit` |
| `tool.before` | ✅ `tool.execute.before` | ✅ `tool_call` | ✅ `tool.call`, before `next` | ✅ `PreToolUse` | ✅ `PreToolUse`; hosted tools never fire it |
| `tool.after` | ✅ `tool.execute.after` | ✅ `tool_result` | ✅ `tool.call`, after `next` | ✅ `PostToolUse` | ✅ `PostToolUse` |
| `permission.asked` | ✅ hook `permission.evaluate` | ❌ no permission layer | ✅ `tool.check` | ✅ `PermissionRequest` | ✅ `PermissionRequest` |
| `response.finished` | ✅ `session.execution.*` | ✅ `agent_settled` | ✅ `turn.complete` | 🟡 `Stop`; does not fire on interrupt | 🟡 `Stop`; does not fire on interrupt |
| `session.idle` (user quiet) | 🔵 timer after finish | 🔵 timer after finish | 🔵 timer after finish | 🔵 timer, or `idle_prompt` (about 60 s) | 🔵 timer in the decider |
| Compaction, before and after | ✅ hook and events | ✅ `session_before_compact`, `session_compact` | ✅ `session.compact` | ✅ `PreCompact`, `PostCompact` | ✅ `PreCompact`, `PostCompact` |
| `session.ended` | ✅ `session.deleted` | ✅ `session_shutdown` | ✅ `session.end` | ✅ `SessionEnd` (1.5 s budget) | ✅ `SessionEnd` (1 s) |
| Subagents | ✅ child sessions with `parentID` | ❌ none | ✅ `agent.spawn`, `agentId` | ✅ `SubagentStop` | ✅ `SubagentStart`, `SubagentStop` |

## 3. Runtime actions

| Action | OpenCode | Pi | Claude Code (mod) | Claude Code (hooks) | Codex |
| --- | --- | --- | --- | --- | --- |
| Append `now` | ✅ `synthetic`, delivery steer | ✅ `sendMessage` | ✅ `$.session.append` | 🟡 context on the next tool hook | 🟡 context on the next tool hook |
| Append `next` | ✅ delivery queue | ✅ `deliverAs: "nextTurn"` | ✅ `prompt.submit` context | 🟡 `UserPromptSubmit` context | 🟡 `UserPromptSubmit` context |
| Append `wake` (idle session) | ✅ prompt or synthetic resumes it | ✅ `triggerTurn: true` | ✅ `$.prompt.submit` | 🟡 messaging socket; `Stop` block at turn end | 🟡 `Stop` block, turn end only |
| Block a prompt | ✅ throw **(inferred)** | ✅ `input` returns handled | ✅ `drop` | ✅ `decision: block` | ✅ `decision: block` |
| Rewrite prompt text | ✅ mutate `prompt.text` | ✅ `input` transform | ✅ `next({...e, text})` | ❌ | ❌ |
| Block a tool call | ✅ throw in `execute.before` | ✅ `{block}` | ✅ `{deny}` | ✅ `deny`, or exit 2 | ✅ `deny`, or exit 2 with stderr |
| Rewrite tool input | ✅ assign `event.input` | ✅ mutate `event.input` | ✅ `next({...e})` | ✅ `updatedInput` | 🟡 `updatedInput`, only with `allow` |
| Ask the user before a tool | 🟡 `permission.evaluate` returns ask | ✅ `ctx.ui.confirm` (needs a UI) | ✅ `$.ui.ask` | ✅ `permissionDecision: ask` | 🟡 deny, with a reason telling the agent to ask |
| `permission.reply` | ✅ `permission.reply` | ❌ n/a | ✅ `tool.check` decision | ✅ `PermissionRequest` | ✅ `PermissionRequest` |
| `session.create` | ✅ `session.create` | 🟡 command handlers, RPC | ❌ | ❌ | ❌ app-server only |
| `session.update` (model) | ✅ `switchModel` | ✅ `setModel` | ✅ `turn.step`, per request | ❌ | ❌ app-server only, experimental |
| `session.compact` | ✅ `compact` | ✅ `ctx.compact` | ✅ `$.session.compact`; completion unconfirmed | ❌ | ❌ app-server only |
| `session.warm` | 🟡 `warming` config only | 🟡 allow or veto a scheduled refresh | ❌ | ❌ | ❌ |
| `session.interrupt` | ✅ `interrupt` | ✅ `ctx.abort` | ✅ `$.turn.abort` | 🟡 `continue: false` at the next hook | ❌ app-server only |
| `session.remove` | ✅ `remove` | ❌ | ❌ | ❌ | ❌ app-server only |
| Runtime registries | ✅ tool, skill, command, MCP, model; agents can only be updated | ✅ tool, command, MCP, provider; no agents | ✅ tool, command, agent | ❌ | ❌ static files |

## 4. Failure and timing

| | OpenCode | Pi | Claude Code (mod) | Claude Code (hooks) | Codex |
| --- | --- | --- | --- | --- | --- |
| Hook timeout | ❌ none; the shim must impose one | ❌ none; the shim must impose one | 10 s of the hook's own run time | 600 s by default; 30 s on prompt hooks | 600 s by default |
| Default on failure | A throw in the before-hook blocks the call | A throw in `tool_call` blocks; other events fail open | Skipped (fails open) | Fails open | Fails open |
| Can fail closed | ✅ throw in `execute.before` | ✅ throw or block in `tool_call` | ✅ `.catch` returns deny | ✅ `onFailure: "block"` (2.1.295+) | 🟡 the command must print a deny; a missing binary still fails open |
| Several plugins on one hook | Sequential; last write wins | First block wins; a later result overwrites `reason` | One chain; the first mod is outermost | Parallel; `deny > defer > ask > allow` | Concurrent; any deny wins; rewrites race |
| MCP notification reaches the model | ❌ | ❌ | ❌ | ❌ | ❌ |

## 5. Generated UI

| Surface | OpenCode | Pi | Claude Code (mod) | Claude Code (hooks) | Codex |
| --- | --- | --- | --- | --- | --- |
| Status or bottom bar | ✅ slot `prompt.footer.status` | ✅ `setStatus` | ✅ `$.ui.status` | 🟡 `statusLine` command, output only | ❌ fixed items only |
| Band above the prompt | ✅ slot `session.composer.top` | ✅ `setWidget` above the editor | ✅ `AbovePrompt` | ❌ | ❌ |
| Sidebar or panel | ✅ `sidebar.content`, `session.panel` | 🟡 anchored overlay | ✅ pane via `$.ui.open` | ❌ | ❌ |
| Dialog | ✅ `ui.dialog.*` | ✅ `ctx.ui.select/confirm/input` | ✅ `Select` and `Input` elements | 🟡 MCP elicitation | 🟡 MCP elicitation form |
| Toast | ✅ `ui.toast.show` | ✅ `notify` | ✅ `$.ui.toast` | ❌ | ❌ |
| Inline in chat | ❌ text fallback (decided 2026-10-21) | ✅ `registerToolRenderer` | ✅ `ToolResult` render site | ❌ | ❌ |
| MCP Apps (HTML) | ❌ | ❌ filtered out | ❌ not in the CLI; Desktop renders them | ❌ not in the CLI | ❌ not in the TUI; GUI clients behind a flag |
| MCP elicitation forms | 🟡 declared; an open report says requests hang | ❌ not advertised | ✅ | ✅ | ✅ form mode |
