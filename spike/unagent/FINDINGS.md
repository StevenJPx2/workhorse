# unagent: one TypeScript SDK for every coding agent

Research spike, 2026-10-21. No code was built. All findings are from official docs, source code read at a named commit, or registry data. Items marked **(inferred)** were not confirmed against a primary source.

## Summary

Most of what `unagent` was meant to unify has been standardized or built by others in the last six months:

- **Portable packaging exists.** [Agent Plugins](https://agent-plugins.org) 1.0.0 (published; 1.1.0 is a working draft) defines one directory with `plugin.json`, `skills/` and `mcp.json`, plus reverse-domain folders for client-specific extras. Codex loads it natively. Copilot CLI and Cursor document support. Claude Code, OpenCode V2, pi and fx do not.
- **Skills over MCP is a Final MCP extension.** [SEP-2640](https://modelcontextprotocol.io/extensions/skills/overview) (`io.modelcontextprotocol/skills`, `skill://` URIs) is what `ARCHITECTURE.md` proposed. No primary coding agent consumes it yet.
- **Runtime driving exists.** The Vercel AI SDK's [`HarnessAgent`](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters) (`@ai-sdk/harness` 1.0.159, 1.4M downloads a month) drives Claude Code, Codex, OpenCode, pi, fx, Cursor, Copilot, Cline, Grok Build and Deep Agents through one session API, with a published capability table. [ACP](https://agentclientprotocol.com) v1 covers editor-to-agent sessions for 42 registry agents.
- **File generation exists.** [rulesync](https://github.com/dyoshikawa/rulesync) (1.13M downloads a month, v38) generates rules, MCP, commands, subagents, skills, hooks and permissions for about 60 tools. [add-mcp](https://github.com/neon-solutions/add-mcp) (754k a month) writes native MCP config for 23 agents and has a programmatic `upsertServer`.
- **The name is taken.** npm `unagent` 0.0.8 belongs to [onmax/unagent](https://github.com/onmax/unagent): agent detection, a skill installer, and cloud primitives.

Several gaps are still open:

- No hook semantics layer with declared fidelity.
- No capability table that both a config writer and a driver consume.
- No plan-before-write that reports what each agent will lose.
- Nothing that connects one capability provider (the Workhorse daemon) to every agent with the per-agent residue made explicit.

### Recommendation

1. **Put capabilities in the daemon, behind MCP.** Tools, resources, Skills over MCP (SEP-2640), and tasks are served once by Workhorse. That is the "through Workhorse" option, and it already matches `daemon/docs/architecture.md`. Permissions stay in daemon policy and are never translated into five agent permission dialects.
2. **Build `unagent` as a small install-time emitter for the residue MCP cannot carry.** That residue is:
   - registering the MCP endpoint in each agent;
   - writing skills to disk for agents that do not read Skills over MCP (all five primary agents today);
   - an optional instruction fragment;
   - a hook bridge that forwards a few lifecycle events to the daemon for steering and approval.

   The input format is Agent Plugins 1.x, so the portable part is a standard, not our invention.
3. **Do not build a runtime driver in the base.** Harness products (Equestrian, Stable) that need to drive Claude Code or Codex should use ACP or AI SDK harness adapters at their own composition root.
4. **Make capability differences data.** Keep one frozen table per agent and agent version, a `plan` step that returns every write with a `native | fallback | unsupported` outcome before anything is written, and fail closed for anything security-relevant.
5. **Pick another name, or a scoped one** such as `@workhorse/agents`. Offer the verified path and capability table to onmax/unagent rather than merging into it. Its scope and design rules do not fit Workhorse (see [onmax/unagent](#onmaxunagent-direct-prior-art)).

### What belongs where

| Concern | Workhorse daemon or protocol | `unagent` (outside the base) | Neither (harness products or upstream) |
| --- | --- | --- | --- |
| Tools, resources, prompts | Served by apps over MCP | Registers the MCP endpoint in each agent's config | — |
| Skills | Served over MCP as SEP-2640 `skill://` | Writes a filesystem fallback while an agent lacks SEP-2640 | — |
| Permissions over the outside world | Policy, leases, Decide | Never translates them | — |
| Agents' own built-in tools (`Bash`, `Edit`) | — | Reports them as unsupported in the plan. It may later emit a read-only view | Each agent's permission system |
| Steering rules, approvals | Rule evaluation in the daemon (Decide, Watch) | Hook bridge: per-agent wire shape to a normalized event, and the decision back | — |
| Waking a session with a mailbox event | Mailbox delivery | Per-host adapter where MCP cannot push (for example an OpenCode plugin) | — |
| Instructions (AGENTS.md) | — | Optional marked fragment in AGENTS.md or CLAUDE.md | AGENTS.md standard |
| Driving an agent session | — | — | ACP, AI SDK harness adapters, used by harness products |
| Agent detection | — | Optional, read-only | `@vercel/detect-agent` |

This follows the doctrine: protocol packages keep contracts only, and runtime packages stay free of concrete providers. `unagent` is a composition-root tool used by the `workhorse` CLI, the same place where the daemon already "regenerates its configuration". Nothing in `protocol`, `core` or `worker` imports it.

---

## 1. Extension surfaces

### Versions checked

| Agent | Version | Evidence |
| --- | --- | --- |
| Claude Code | CLI 2.1.302 local; npm `@anthropic-ai/claude-code` 2.1.306; `@anthropic-ai/claude-agent-sdk` 0.3.306 | `claude --version`, `npm view`; docs at `code.claude.com/docs/en/*.md` |
| Codex | CLI 0.163.0 local; npm `@openai/codex` and `@openai/codex-sdk` 0.163.0 | `codex --version` gives `codex-cli 0.163.0`. The `--help` output of `exec`, `mcp`, `plugin`, `app-server` and `execpolicy`, run with an isolated `CODEX_HOME`, confirms the CLI facts below. Also `npm view`, source `openai/codex` at `c7234c1` (2026-10-21), and docs at developers.openai.com/codex. One earlier `--version` call hung once and could not be reproduced |
| OpenCode V2 | CLI 2.0.32 local; npm `@opencode/{cli,sdk,plugin,client}` 2.1.2 | `opencode --version`; docs at https://opencode.ai/v2/docs/ only; source `anomalyco/opencode` at `4d59657` |
| pi | 1.3.0, released 2026-10-15; npm `@earendil-works/pi-coding-agent` 1.3.0 | `pi --version`; source `earendil-works/pi` (formerly `badlogic/pi-mono`) at `16f5f0a` |
| fx | 0.0.14, released 2026-10-16; `libfx` 0.0.14 | https://fx.sh, source `vercel-labs/fx` at `a2be4ab`. Not installed locally |

Package-name traps:

- The `@opencode-ai/*` packages (1.19.3) are the V1 line.
- `@mariozechner/pi-coding-agent` is stale at 0.73.1.
- `/opt/homebrew/bin/copilot` on this machine is AWS Copilot, not GitHub Copilot CLI.

### MCP servers

| | Claude Code | Codex | OpenCode V2 | pi | fx |
| --- | --- | --- | --- | --- | --- |
| Project file | `.mcp.json` (`mcpServers`) | `.codex/config.toml` (trusted projects only) | `opencode.json(c)` or `.opencode/opencode.json(c)` | `.pi/mcp.json` (only after project trust) | `.mcp.json` (`mcpServers`); each server needs `fx mcp trust approve` |
| User file | `~/.claude.json` (user scope, and per-project "local" scope keyed by absolute path) | `~/.codex/config.toml` | `~/.config/opencode/opencode.json(c)` | `~/.pi/agent/mcp.json` | `~/.fx/mcp.json` (`mcp` key; `mcpServers` accepted) |
| Format | JSON, `mcpServers.<name>` | TOML, `[mcp_servers.<name>]` | JSON or JSONC, `mcp.servers.<name>`, with `type: local \| remote` and `command` as an array | JSON, `mcpServers.<name>` | JSON; `type: local \| http \| sse`, `command` as an array, `environment` |
| Transports | stdio, http, sse (deprecated), ws | stdio, Streamable HTTP | stdio, Streamable HTTP only | stdio, Streamable HTTP (SSE rejected) | stdio, Streamable HTTP, HTTP+SSE |
| Auth | OAuth (DCR, CIMD, preregistered), `headers`, `headersHelper`; `${VAR}` expansion, but credential-like variables expand to empty in remote `url` and `headers` | OAuth (`codex mcp login`), `bearer_token_env_var`, `env_http_headers`, `http_headers_helper` | OAuth on by default (PKCE, CIMD, DCR); `headers`; `{env:NAME}` | OAuth (`pi mcp login`); `${VAR}` and `!command` expansion | OAuth; `bearer_token_env`, `header_env`; a literal `Authorization` header is rejected in profile entries |
| Tool name the model sees | `mcp__server__tool` | `mcp__server__tool` | `server_tool`, reached through Code Mode by default | `mcp__server__tool`, reached through Code Mode by default | Loaded lazily via `capability_search`; naming not verified |
| Headless gotcha | `claude -p` loads `.mcp.json` servers with no approval prompt, and OAuth cannot run headless | Untrusted project config is ignored silently. `codex mcp list --json` prints `env` values in plain text, while the table view masks them | Code Mode hides tools unless `codemode: false` | Project MCP is skipped headless unless `--approve` | Project servers stay inert until approved; every MCP call in `auto` mode goes to a reviewer model |
| Skills over MCP (SEP-2640) | Not listed | No; Codex has an internal `skill://` provider that is not the MCP extension | Not found | Not found | Documented as not implemented |

Sources:

- Claude Code: `mcp.md`, `managed-mcp.md`.
- Codex: developers.openai.com/codex/mcp.
- OpenCode: `/v2/docs/mcp-servers/`.
- pi: `packages/coding-agent/docs/mcp.md`.
- fx: `fx.sh/docs/capabilities/mcp.md`.
- SEP-2640: https://modelcontextprotocol.io/extensions/client-matrix and the [ext-skills implementations list](https://github.com/modelcontextprotocol/ext-skills/blob/main/docs/implementations.md) at `c1aa87e`.

MCP's current revision is [2026-07-28](https://modelcontextprotocol.io/specification/versioning). It is stateless and negotiates the protocol version on each request. OpenCode (`protocol: legacy|auto|2026-07-28`) and fx (`FX_MCP_PROTOCOL_VERSION`) let users choose. Workhorse must therefore serve both the 2025-11-25 handshake and the 2026-07-28 per-request versioning.

### Instruction files

| | Claude Code | Codex | OpenCode V2 | pi | fx |
| --- | --- | --- | --- | --- | --- |
| Native file | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/**/*.md` (with `paths:`) | `AGENTS.md`, `AGENTS.override.md` | `AGENTS.md` only | `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`; `SYSTEM.md` and `APPEND_SYSTEM.md` | `AGENTS.md` only |
| Reads AGENTS.md | Only as a fallback when no CLAUDE.md or CLAUDE.local.md exists (v2.1.277+); a setting can read both | Yes | Yes | Yes | Yes |
| Discovery | cwd and parents at launch; subdirectories on demand; `@path` imports up to 4 hops | Project root down to cwd, one file per directory; 32 KiB combined cap (`project_doc_max_bytes`) | Workspace up toward home; nested files lazily; `instructions` globs and URLs | Agent dir, cwd and parents | cwd and parents up to `$HOME`; nested files when working under them |

Portable approach: write `AGENTS.md`. For Claude Code, add `@AGENTS.md` to a `CLAUDE.md` only if one already exists, because a single `CLAUDE.local.md` silently disables the AGENTS.md fallback.

### Skills

| | Claude Code | Codex | OpenCode V2 | pi | fx |
| --- | --- | --- | --- | --- | --- |
| Project paths | `.claude/skills` | `.agents/skills` | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `.pi/skills`, `.agents/skills` (trust-gated) | `.fx/skills`, `skills/`, `.opencode/skills`, `.codex/skills`, `.claude/skills`, `.agents/skills`, `.claw/skills` |
| User paths | `~/.claude/skills` | `~/.agents/skills`, `/etc/codex/skills` | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | `~/.pi/agent/skills`, `~/.agents/skills` | `~/.fx/skills` and the matching user paths |
| Agent Skills spec | States it follows the spec and adds about 13 fields (`when_to_use`, `context: fork`, `hooks`, `paths`, …); unknown fields ignored | Follows the spec; adds `agents/openai.yaml` | Partial: ID comes from the path, not `name`; length rules not enforced; `license` and `compatibility` ignored | Follows the spec; does not require the name to match the directory | Partial: only `name` and `description` parsed |
| Commands merged into skills | Yes; `.claude/commands/*.md` is the legacy form | Custom prompts deprecated; skills replace them | No; commands are separate | No; prompt templates are separate | No commands |

`.agents/skills` is the nearest thing to a shared path. Claude Code is the only primary agent that does not read it, so a skill must be written twice: `.agents/skills/<name>/` and `.claude/skills/<name>/`, or a symlink, which Claude Code and Codex both follow.

### Commands, subagents and plugins

| | Claude Code | Codex | OpenCode V2 | pi | fx |
| --- | --- | --- | --- | --- | --- |
| Commands | Skills, or legacy `.claude/commands/*.md` with `$ARGUMENTS`, `$N` and ``!`cmd` `` | None current; `~/.codex/prompts` documented as deprecated, and no loader found in source **(inferred removed)** | `.opencode/commands/*.md` with `$ARGUMENTS`, `$1…` and ``!`cmd` `` (runs outside permissions) | `.pi/prompts/*.md` with `$1`, `$@`, `${1:-default}` | None |
| Subagents | `.claude/agents/*.md`, camelCase frontmatter (`tools`, `model`, `permissionMode`, `mcpServers`, `hooks`, …) | `.codex/agents/*.toml`: `name`, `description`, `developer_instructions`; cannot set tools, sandbox or MCP | `.opencode/agents/*.md`: `mode`, `model`, `permissions` (rule list), `steps` | None in core (example extension only) | Built in, created in natural language; no files |
| Plugin format | `.claude-plugin/plugin.json` plus `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `bin/`, …; marketplaces in `.claude-plugin/marketplace.json` | Agent Plugins 1.0 root `plugin.json` (preferred); fallbacks are `.codex-plugin/`, `.claude-plugin/` and `.cursor-plugin/` manifests; extras only under `extensions["com.openai"]`; marketplaces in `.agents/plugins/marketplace.json` | `Plugin.define({id, setup})` TS/JS modules from npm or Git; `opencode plugin add` | pi packages (npm or Git) bundling extensions, skills, prompts and themes; `pi install` | None for the CLI |
| Agent Plugins 1.0 | No reference found in the docs (`rg`) | Yes (`codex-rs/utils/plugins/src/plugin_namespace.rs`, `codex-mcp/src/agent_plugin_config.rs`) | No reference found in source (`rg`) | No reference found | No reference found |

### Hooks

| | Claude Code | Codex | OpenCode V2 | pi | fx |
| --- | --- | --- | --- | --- | --- |
| Mechanism | Shell command, HTTP, MCP tool, prompt or agent handlers in `settings.json` and plugin `hooks/hooks.json` | Shell command or MCP tool handlers in `hooks.json` or `config.toml`; each hook must be trusted by hash | In-process TS: `ctx.tool.hook("execute.before")` and others | In-process TS: `pi.on("tool_call")` and others | None for users. Internal Zig control hooks; libfx observer hooks only |
| Events | 33, including `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`, `SessionStart`, `Stop`, `SubagentStop`, `PreCompact` | 12: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Pre/PostCompact`, `UserPromptSubmit`, `Subagent{Start,Stop}`, `Stop`, `Interrupt`, `Session{Start,End}` | `prompt`, `context`, `compaction`, `generate`, `title`, `model.request`, `http.*`, `retry`, `permission.evaluate`, `shell.create.before`, `tool.execute.before/after`, plus an event bus | `input`, `before_agent_start`, `context`, `tool_call`, `tool_result`, `turn_*`, `agent_*`, `session_*`, about 33 in total | — |
| Block a tool call | Exit 2, or `permissionDecision: "deny"` | Exit 2, `permissionDecision: "deny"`, or legacy `decision: "block"` | Throw in `execute.before` | Return `{block: true}`, or throw | — |
| Rewrite tool input | `updatedInput` | `updatedInput` (with `allow`) | Mutate `input` | Mutate `input` (no revalidation) | — |
| Ask the user | `permissionDecision: "ask"` | Unsupported; the hook fails and does not block | `permission.evaluate` can set `ask`, but a configured `deny` never reaches it | No permission layer | — |
| Failure semantics | Exit 1 and timeouts do not block | A hook failure does not block | A thrown error blocks | A thrown error blocks | — |

Sources: Claude Code `hooks.md`; developers.openai.com/codex/hooks; `/v2/docs/build/plugins/` and `packages/plugin/src/promise/tool.ts`; pi `docs/extensions.md` and `src/core/extensions/types.ts`; fx `src/core/hooks/definitions.zig`.

Codex deliberately mirrors the Claude Code hook shape: same event names, `hookSpecificOutput.permissionDecision`, and it sets `CLAUDE_PLUGIN_ROOT`. A Claude command hook is therefore close to portable to Codex. OpenCode and pi need an in-process shim. fx cannot be hooked.

### Permissions

| | Model |
| --- | --- |
| Claude Code | `permissions.allow/ask/deny` rules such as `Bash(npm run *)`; evaluated deny, then ask, then allow; six modes; OS sandbox for Bash only |
| Codex | `sandbox_mode` (`read-only`, `workspace-write`, `danger-full-access`) plus `approval_policy` (`on-request`, `never`, granular; the CLI flag accepts only the first two); `--profile <name>` layers `$CODEX_HOME/<name>.config.toml` over the base config; Starlark `.rules` (`allow`, `prompt`, `forbidden`; strictest wins); per-tool MCP `approval_mode`; permission profiles in beta |
| OpenCode V2 | Ordered `{action, resource, effect}` list; last match wins; default `ask`; `external_directory` allowed by default; separate `policies` layer where the broader scope wins |
| pi | No approvals. Only project trust; gates come from extensions |
| fx | `ask`, `auto` (default) or `full-access`; in `auto`, a reviewer model checks risky calls, including every MCP call; rules last-match-wins |

These five models disagree on rule order, default effect, tool names, path syntax and who decides. Translating one rule set across them would make policies say things that are not enforced. This is why permissions over the outside world belong in daemon policy, where Workhorse already enforces them.

### Headless runs and SDKs

| | CLI | Streaming | Structured output | SDK | ACP |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `claude -p` | `--output-format stream-json` | `--json-schema` gives `structured_output` | `query()` in the Agent SDK spawns the bundled CLI; `canUseTool`, in-process hooks, in-process MCP | Through the `@agentclientprotocol/claude-agent-acp` adapter |
| Codex | `codex exec` (also `resume`, `fork`, `review`; `--full-auto` is rejected) | `--json` (JSONL `thread.*`, `turn.*`, `item.*`) | `--output-schema` | `@openai/codex-sdk` spawns the CLI (no approvals, steering or hooks); `codex app-server` JSON-RPC has steering and approvals. `codex mcp-server` has been removed | Through `@agentclientprotocol/codex-acp` |
| OpenCode V2 | `opencode run` | `--format json` (NDJSON) | Not documented **(inferred: none)** | `@opencode/client` (HTTP, OpenAPI, SSE); `@opencode/sdk` (in-process) | Native: `opencode acp` |
| pi | `pi -p` | `--mode json`; `--mode rpc` over stdin and stdout | No flag; use a tool with `terminate: true` | `createAgentSession()`; SDK sessions skip built-in extensions, including MCP | Community `pi-acp` |
| fx | `fx ask` | None; `--json` returns one object at the end | No | `libfx` (`createFxAgent`, `createFxEngine`) | Native: `fx acp` |

### Secondary agents (brief)

| | MCP config | Reads AGENTS.md | Skills | Hooks | Headless | ACP |
| --- | --- | --- | --- | --- | --- | --- |
| Gemini CLI 0.65.0 | `settings.json` `mcpServers` | Only with `context.fileName` | Yes, cites agentskills.io; `.gemini/skills`, `.agents/skills` | 11 events, JSON over stdio | `-p`, `-o stream-json` | `gemini --acp` |
| Cursor | `.cursor/mcp.json` | Yes | Yes; also reads `.claude/skills` and `.codex/skills` | `.cursor/hooks.json`; also loads Claude Code hooks | `agent -p` | `agent acp` |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json`, `.mcp.json` | Yes, plus CLAUDE.md and GEMINI.md | Yes; `.github/skills`, `.claude/skills`, `.agents/skills` | `.github/hooks/*.json`; Claude-style aliases | `copilot -p` | `copilot --acp` (preview) |
| Amp | `amp.mcpServers` | Yes | Yes; also `.claude/skills` | TS plugins only | `amp -x`, `--stream-json` | Not native |
| Goose | `config.yaml` extensions | Yes | Yes | Through plugins | `goose run` | `goose acp` |
| Zed | `context_servers` | Yes (Zed Agent) | Yes; only `name` and `description` | — | — | ACP host |

Sources: the Gemini CLI repo docs, `cursor.com/docs/*.md`, docs.github.com Copilot CLI reference, ampcode.com/docs, the `aaif-goose/goose` documentation, and the Zed repo `docs/src/ai`.

### Quirks that make portability hard

1. **The same concept lives in different files and formats.** MCP alone uses JSON `mcpServers`, TOML `[mcp_servers]`, JSONC `mcp.servers` with array commands, and fx's `mcp` key with `environment`. Env expansion syntax also differs: `${VAR}`, `{env:VAR}`, `!cmd`, or none.
2. **Trust gates silently drop project config in headless runs.** Codex ignores untrusted `.codex/`. pi skips `.pi/*` without `--approve`. fx keeps project MCP servers inert until approved. Claude `-p` does the opposite and loads `.mcp.json` with no prompt. An installer must report trust as a required user step and must never grant trust itself.
3. **Silent ignore is the norm.**
   - Claude Code ignores unknown frontmatter, agents without `name`, and `url` entries without `type`.
   - OpenCode drops skills without `description`.
   - Codex fails hook fields it does not support without blocking the action.
4. **Tool exposure differs.** OpenCode and pi hide MCP tools behind Code Mode by default, and fx loads them lazily. Server `instructions` and tool descriptions therefore matter more than tool lists, and a "deny this tool" rule may target a name the model never sees.
5. **Hook semantics diverge where it matters for safety.** Failure blocks in OpenCode and pi but not in Claude Code or Codex. `ask` exists only in Claude Code (and indirectly in OpenCode). fx has no hooks at all.
6. **Instruction precedence traps.** Claude Code's AGENTS.md support turns off when any CLAUDE.md exists. OpenCode V2 dropped CLAUDE.md. Codex caps the combined size at 32 KiB.
7. **Skill identity.** OpenCode derives the ID from the path, Claude Code from `name`. Frontmatter extensions are vendor-specific: `when_to_use` in Claude, `agents/openai.yaml` in Codex, `metadata.opencode/*` in OpenCode.
8. **Churn.** Recent examples:
   - Claude Code AGENTS.md support arrived in 2.1.277 (2026-09-18).
   - pi gained native MCP in 1.0.0 (2026-10-01).
   - OpenCode V2 replaced its plugin API.
   - Codex removed `mcp-server` and `untrusted`, and changed profiles in 0.134.0 (2026-05-26).
   - fx renamed `createFxAgent` between 0.0.13 (2026-10-04) and 0.0.14 (2026-10-16).

   Any per-agent knowledge needs a version range and a re-verification job.

---

## 2. Prior art

Adoption figures are npm downloads for 2026-09-19 to 2026-10-18 from `api.npmjs.org`, and GitHub stars from `gh api`, both on 2026-10-21. Downloads include CI and transitive installs.

### Standards

| Standard | Unifies | Status | Primary-agent support |
| --- | --- | --- | --- |
| [AGENTS.md](https://agents.md) | Prose instructions | Stewarded by the Agentic AI Foundation (Linux Foundation); 25k stars | All five. Claude Code reads it only as a fallback |
| [Agent Skills](https://agentskills.io) | `SKILL.md` folders | Anthropic-originated; 26.3k stars; no spec version number | All five, with varying strictness |
| [Agent Plugins](https://agent-plugins.org) | A package of skills plus `mcp.json`, with namespaced client extras | 1.0.0 published, 1.1.0 draft; steering committee includes Amazon, Cursor, Microsoft, OpenAI and Vercel; 1.4k stars | Codex (plus Copilot and Cursor per their docs). Commands, hooks, agents and rules are explicitly left out of v1 |
| MCP 2026-07-28 plus [Skills extension](https://modelcontextprotocol.io/extensions/skills/overview) | Tools, resources, prompts; skills over `skill://` with digests and manifests | SEP-2640 is Final; the official TypeScript SDK support is still an open PR | Tools: all five. Skills: none of the five |
| [ACP](https://agentclientprotocol.com) | Editor-to-agent sessions, streaming, permission requests, MCP injection | Protocol v1 (schema 1.26.0); v2 is in alpha; 42 registry agents | Native in OpenCode and fx; adapters for Claude Code, Codex and pi. Has no notion of hooks, skills or rules |
| A2A 1.0 | Agent-to-agent | Linux Foundation; absorbed IBM's "Agent Communication Protocol" | Not aimed at coding CLIs |

### onmax/unagent (direct prior art)

| Fact | Value |
| --- | --- |
| Package | npm `unagent` 0.0.8, first published 2026-02-01, last published 2026-02-10; 6,850 downloads in the last month |
| Repository | [onmax/unagent](https://github.com/onmax/unagent): 20 stars, last pushed 2026-10-19. `main` was last committed on 2026-02-17 (`78a4728`), but 16 feature branches are active (queue, sandbox, vector, workflow, pricing sync) |
| License | `MIT` in `package.json`; no LICENSE file in the repository |
| Docs | https://unagent.onmax.me. The README links `unagent.unjs.io`, which redirects to `github.com/unjs/unagent`, which returns 404. **(inferred: an intended move into unjs that has not happened)** |

**What it unifies**, from its README and `src/`:

- Agent detection by environment variables: a table of 51 agents, with parity to `@vercel/detect-agent`.
- Skill discovery, parsing and installation from local paths or Git, with symlink or copy, a lockfile and hashes.
- Under the same package, unrelated provider-agnostic cloud primitives in subpath exports: `browser`, `sandbox`, `jobs`, `queue`, `task`, `vector`, `workflow`, `usage`, `vercel`.

**Design**:

- An unjs-style toolkit of plain functions with optional providers per subpath.
- One `AgentConfig` record per agent, with fields `configDir`, `rulesFile`, `skillsDir`, `envDetect`.
- No MCP configuration, hooks, commands, subagents, permissions, capability model or plan step.

**Data quality is a concern.** In `src/env/agents.ts` on `main`:

- Codex's `rulesFile` is `instructions.md`, but Codex reads `AGENTS.md`.
- Codex and OpenCode have no `skillsDir`.
- Gemini's `configDir` is `~/.config/gemini`.
- pi and fx are absent.

**Verdict: build beside it, under another name, and offer data upstream.**

- **Do not contribute the core.** Its scope (cloud primitives, sandboxes, vector stores) contradicts "light base, harness products outside". Its style has no Effect, no explicit effects and no strict schemas. Workhorse's capability and plan model would be a rewrite of it, not a contribution.
- **Do not take the name.** Even if npm ownership could be negotiated, the name already means "agent detection and skill installer" to its users. The docs link also suggests it may become an unjs project.
- **Do contribute the verified agent path table**, or publish it as data both projects consume. That helps the ecosystem at low cost.

### Generators (define once, write native files)

| Tool | Generates | Agents | Adoption | Gaps |
| --- | --- | --- | --- | --- |
| [rulesync](https://github.com/dyoshikawa/rulesync) v38.0.0 | Rules, ignore, MCP, commands, subagents, skills, hooks, permissions | About 60, with a per-tool feature matrix; also `import` and `convert` | 1.13M a month, 1.5k stars | A major version every few weeks. Copies formats without semantic hook normalization. No plan of what is lost before writing |
| [ruler](https://github.com/intellectronica/ruler) 0.3.44 | Rules, MCP, skills, some subagents; `revert` | About 33 | 300k a month, 2.9k stars | No hooks, commands or permissions; labelled a beta research preview |
| vibe-rules 0.3.91 | Rules | About 8 | 45k a month | No release in 14 months |
| acplugin 1.7.0 | Converts a Claude plugin to Codex, OpenCode, Cursor and pi | 5 | 157 a month | Hooks become native only for Codex |

### Installers

| Tool | Installs | Notes |
| --- | --- | --- |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) 1.7.4 (`npx skills`) | Skills into the paths of about 79 agents | 22.9M a month (CI-inflated); collects telemetry |
| `gh skill` | Skills | Copies with tracking metadata |
| [add-mcp](https://github.com/neon-solutions/add-mcp) 2.4.1 | MCP servers into native config for 23 agents, including all five primary agents except fx **(fx not in its table)** | 754k a month; programmatic `upsertServer(agent, name, config, {local})`; handles JSON, JSONC, TOML and YAML |
| MCP Registry, `server.json` | Metadata only | Writes no client config |

### Runtime drivers (one session API)

| Project | Mechanism | Agents | Adoption |
| --- | --- | --- | --- |
| [AI SDK `HarnessAgent`](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters) (`@ai-sdk/harness-*`) | A sandbox bridge, a host process, or ACP; normalizes sessions, stream events, tools, usage and lifecycle | Claude Code, Codex, OpenCode, pi, fx, Cursor, Copilot, Cline, Grok Build, Deep Agents; Amp, Goose and Mastra coming | 1.4M a month; labelled experimental |
| ACP adapters (`claude-agent-acp` 0.94.0, `codex-acp` 2.2.2) plus `acpx` | ACP over stdio | 42 registry agents | 4.5M, 3.8M and 3.3M a month |
| [`@sublang/cligent`](https://github.com/sublang-ai/cligent) 0.36.0 | Vendor SDKs as optional peers, plus ACP; refuses unsupported runtime versions | Claude Code, Codex, Gemini, Kimi, OpenCode | 4.5k a month, 57 stars |
| Rivet Sandbox Agent (`sandbox-agent` 0.5.3) | Rust daemon with HTTP, SSE and a universal session schema | Claude Code, Codex, OpenCode, Cursor, Amp, pi | 377k a month |
| coder/agentapi | Terminal scraping | 11 | Archived and deprecated |
| AI SDK providers (`ai-sdk-provider-claude-code`, `-codex-cli`, `-opencode-sdk`) | The agent wrapped as a language model | One each | 209k, 133k and 331k a month; they lose the harness's own tools and approvals |

The AI SDK capability table shows exactly what does not unify at runtime:

- Structured output is missing on Cursor, Copilot and pi.
- Built-in tool approval and filtering are missing on Codex, Cursor, Copilot and Grok.
- History access is missing on every adapter.

### Cross-compatibility built into agents

The agents themselves have become the largest unifier:

- **Cursor** reads `.claude/skills`, `.codex/skills`, `.claude/agents` and Claude hooks.
- **Copilot CLI** reads `.claude/skills` and a subset of `.claude/settings.json`, including hooks. An open issue reports that the permissions in that file are not applied ([copilot-cli #2338](https://github.com/github/copilot-cli/issues/2338), opened 2026-03-27).
- **Codex** imports Claude Code and Cursor configuration. Its app-server exposes `externalAgentConfig/detect|import` for instructions, config, skills, plugins, MCP, subagents, hooks, commands, memory and sessions (`codex-rs/external-agent-migration/`). It also reads `.claude-plugin/plugin.json` as a fallback manifest.
- **OpenCode, Copilot, Amp, Goose and fx** read `.claude/skills`.

Each importer is one-way, hand-written and versioned with its host.

### Hook normalization

No specification exists. rulesync generates hook files per tool. Cursor reads Claude Code's format with partial event and tool-name mapping, and Copilot reads a subset of it. Codex mirrors the Claude shape. `@deepseek-ai/dsh-hook-protocol` (0.0.1-rc.1) proposes a shared Claude and Codex wire format but has no adoption.

### Multi-agent orchestrators

vibe-kanban (28.4k stars, now sunsetting), Superset (15.4k), claude-squad (8.6k), emdash (6.0k), and Conductor (closed source) run several CLIs in worktrees or tmux. They unify by process, not schema, and expose no reusable library.

### What nobody has done

1. One versioned, tested data table of each agent's paths, formats and capabilities. Today rulesync, ruler, add-mcp, skills and onmax/unagent each keep a private copy, and they disagree.
2. A plan step that reports, per agent and feature, `native | fallback | unsupported` before writing anything, and fails closed for security-relevant features.
3. Hook semantics with declared fidelity: which decisions are enforceable on which agent.
4. One capability provider serving every agent over MCP, with only the per-agent residue generated. This is Workhorse's position, and nobody else is placed to do it.

---

## 3. The unjs pattern

Repositories cloned at `main` on 2026-10-21:

| Project | Version | Key files |
| --- | --- | --- |
| unplugin | 3.4.0 | `src/types.ts`, `src/define.ts` |
| unstorage | 2.0.0-beta.0 | `src/types.ts`, `src/storage.ts` |
| unenv | 2.0.0-rc.24 | `src/env.ts`, `src/runtime/_internal/utils.ts` |
| db0 | 0.4.1 | `src/capabilities.ts` |
| crossws | 0.4.15 | `src/peer.ts` |
| c12 | 4.0.0-rc.2 | `src/loader.ts` |
| hookable | 6.1.2 | `src/hookable.ts` |
| Nitro | 3.0.260903-beta | `src/presets/_resolve.ts` |

| Project | Adapter contract | How it exposes differences | Escape hatch |
| --- | --- | --- | --- |
| unplugin | One rollup-shaped hook object; `createUnplugin(factory)` gives lazy per-bundler getters; `meta.framework` is a discriminated union | A hand-written support matrix. Unsupported hooks are **silently ignored** (`watchChange` on esbuild, `enforce` on Bun); some misuses throw at the call | Per-bundler blocks (`vite: {}`, `webpack(compiler)`), `getNativeBuildContext()`, `.raw` |
| unstorage | `DriverFactory` returning an object with required and optional methods | A missing method means unsupported; writes to read-only mounts are **silent no-ops**; the `flags.ttl` flag is never enforced | `getInstance()` |
| unenv | Presets of `alias`, `inject`, `polyfill`, `external`; negation with `false` and `!item` | Stubs import fine and **throw at call time** with a `__unenv__` marker | `overrides` |
| db0 | `Connector` with a dialect and `capabilityOverrides` | A **frozen boolean capability table** merged from dialect defaults; callers check before use and get errors that name the connector | `getInstance()` |
| crossws | One hooks object; per-runtime adapters | A **matrix next to the code**; unsupported methods **warn once**, then no-op | Native peer, `peer.websocket` |
| c12 | Layers: overrides, config file, rc, package.json, `extends`, defaults; `$env` blocks | `layers[]` preserves provenance; merging with `defu` concatenates arrays, a recurring complaint (#113, #309) | `resolve`, `merger` |
| hookable | Serial `callHook`, parallel `callHookParallel` | `beforeEach` and `afterEach` for tracing | `callHookWith` |
| Nitro presets | A preset is a config layer plus hooks; `extends` composes presets | `compatibilityDate` gates presets and **fails with the candidate list** | Any config key, `rollupConfig` |

### Rules that transfer

1. **Keep the target-neutral definition separate from typed per-target blocks** (unplugin). Narrowing on `target` gives native types. A `raw` or native escape hatch must exist so nobody forks.
2. **Capabilities are a frozen data table, not method presence** (db0). Store them per agent, per version range, with overrides.
3. **Generate the docs matrix from the table the code uses** (crossws keeps it close; unplugin's hand-written table has drifted).
4. **Declare per feature how a gap is handled.** Use `native | fallback | unsupported`, with a default policy for each feature. Never ignore silently; that is the most common complaint against unplugin and unstorage.
5. **Fail closed on security.** A deny rule or blocking hook that a target cannot enforce is an error at plan time. Degrading requires an explicit `allowDegrade` naming the feature (Nitro's resolution error).
6. **Plan before effect.** Resolve a definition and targets into an operation list with reasons and provenance (c12 `layers[]`). Tests assert on plans; the CLI prints them.
7. **A target is a preset:** data plus a few hooks, composed with `extends`, so one merge path serves built-in and user targets (Nitro).
8. **Fix merge semantics per key.** MCP servers merge by name and replace, permission rules append in order, skills are keyed by ID. Never default to array concatenation (c12).
9. **Use serial hooks for veto or mutation and parallel hooks for observers**, and allow return values (hookable #87).
10. **Per-target subpath exports** (`unagent/claude`) with version checks at construction (unplugin's Bun adapter).
11. **Stubs that throw** carry a marker and one error format, `[unagent] [codex] …` (unenv, unstorage).

---

## 4. Design options

| | A. Build or install time (unplugin-style emit) | B. Runtime driver (ACP-like) | C. Hook normalization | D. Through Workhorse (MCP via the daemon) |
| --- | --- | --- | --- | --- |
| Unifies well | MCP registration, skills, AGENTS.md, plugins via Agent Plugins | Start, prompt, stream, cancel, resume; MCP injection per session (ACP `session/new.mcpServers`) | Pre-tool deny and rewrite, session-start context, stop or continue, for agents with hooks | Tools, resources, prompts, skills (SEP-2640), tasks, mailboxes, secrets, policy; one implementation for every MCP host |
| Cannot unify | Permissions (five incompatible models); commands (fx has none, Codex deprecated them); subagents (Codex cannot set tools; pi and fx have no files); trust grants (must stay human) | Structured output, tool approval and history (see the AI SDK table); hooks, skills and rules (outside ACP); config layering | `ask` (Claude Code only); fail-open versus fail-closed; fx (no hooks); in-process versus shell; tool names (`Bash` and `apply_patch` versus `shell`) | How an agent shows MCP tools (Code Mode in OpenCode and pi); agents' built-in tools; skills until agents adopt SEP-2640; push into an idle session; registering the server in the first place |
| How differences surface | Plan with `native`, `fallback` or `unsupported` per feature; typed per-agent blocks | Capability flags per adapter (as AI SDK does); `session.native` | A fidelity table per event and decision; fail closed | Almost none: agents speak MCP. Residue goes to A for registration and fallbacks, and C for steering |
| Maintenance as agents change | High per agent: paths, formats and trust rules move monthly. Bounded if limited to MCP, skills, AGENTS.md and the hook bridge | Very high; already paid by Vercel, the ACP adapters and vendors | Medium: Claude Code and Codex converge, OpenCode and pi need shims, fx is out | Low: MCP is versioned and negotiated; the daemon owns its contract |
| Already done by | rulesync, ruler, add-mcp, skills, Agent Plugins | AI SDK harnesses, ACP, cligent, Sandbox Agent | Nobody, properly | Nobody; this is Workhorse's position |
| Fit with Workhorse | Good if it stays a composition-root tool | Belongs in harness products, not the base | Good as a thin bridge; decisions stay in the daemon | Core architecture already |

**Choice: D first, A narrowed to D's residue, and C narrowed to a bridge that carries daemon decisions.** B is out of scope for the base. A harness that needs it takes `@ai-sdk/harness-*` or ACP (dependency approval required).

---

## 5. Proposed shape

### Scope of v0

`unagent` takes a Workhorse capability package (an Agent Plugins directory) and makes each installed agent able to use it, reporting precisely what each agent will not do. It writes no permissions, no commands and no subagent files in v0.

| Feature | v0 behaviour |
| --- | --- |
| MCP endpoint | Native entry in each agent's config: the stdio relay `workhorse mcp <app>`, or HTTP |
| Skills | Native SEP-2640 when an agent advertises it (none yet). Otherwise a filesystem fallback in `.agents/skills`, plus `.claude/skills` for Claude Code |
| Instructions | Opt-in marked block in `AGENTS.md`; never creates `CLAUDE.md` |
| Hook bridge | `pre-tool`, `session-start` and `stop` forwarded to the daemon. Native for Claude Code and Codex (command hooks); a generated plugin or extension for OpenCode and pi; `unsupported` for fx |
| Trust | Reported as a manual step (`codex` trust, `pi --approve`, `fx mcp trust approve`). Never performed |
| Permissions, commands, subagents | `unsupported` in the plan, with the reason |

### Package layout

A sibling Bun workspace next to `daemon/`, with the same gates, or packages inside `daemon/packages` if you prefer one workspace (open question 3):

```text
agents/                     # name to be decided
├── packages/
│   ├── model/        definition schema (Effect Schema); Agent Plugins 1.x read/validate; no I/O
│   ├── targets/      capability table + pure emitters per agent; subpath exports
│   │                 targets/claude, targets/codex, targets/opencode, targets/pi, targets/fx
│   │                 lint bans cross-target imports and all I/O
│   ├── apply/        the only package that reads and writes agent config; owns marked
│   │                 entries, merges by key, writes atomically, reverts
│   ├── hook-bridge/  tiny executable: agent hook stdin → normalized event → daemon →
│   │                 agent-shaped stdout and exit code; fails closed on timeout
│   └── conformance/  runs the real CLIs headless in a throwaway HOME
```

The `workhorse` CLI (`daemon/packages/cli`) depends on `model`, `targets` and `apply` to implement `workhorse connect <agent>`. `protocol`, `core` and `worker` never import them.

### API sketch

```ts
import { Effect } from "effect";
import { Package, plan, apply, revert } from "@workhorse/agents"; // name to be decided
import { claude } from "@workhorse/agents/targets/claude";
import { codex } from "@workhorse/agents/targets/codex";
import { opencode } from "@workhorse/agents/targets/opencode";
import { pi } from "@workhorse/agents/targets/pi";
import { fx } from "@workhorse/agents/targets/fx";

// 1. Read a standard Agent Plugins directory. Only the namespaced
//    folder dev.workhorse/ carries extras (hook bridge, instruction block).
const pkg = yield* Package.load("./sourcefed"); // validates plugin.json, mcp.json, skills/

// 2. Pure: resolve against installed agent versions. No writes.
const p = yield* plan(pkg, {
  scope: "user", // "user" | "project"
  root: "/path/to/project",
  targets: [claude(), codex(), opencode(), pi(), fx()], // each probes its version once
  allowDegrade: [], // e.g. ["hooks.preTool"] to accept 'unsupported'
});

// p.items: ReadonlyArray<{
//   target: "claude" | "codex" | "opencode" | "pi" | "fx"
//   feature: "mcp" | "skills" | "instructions" | "hooks.preTool" | "hooks.sessionStart" | "hooks.stop"
//   outcome: "native" | "fallback" | "unsupported"
//   reason: string                       // e.g. "fx 0.0.14 has no user hooks"
//   writes: ReadonlyArray<FileWrite>     // path, owned key, before/after digest
//   manual: ReadonlyArray<ManualStep>    // e.g. "run: fx mcp trust approve sourcefed"
// }>
// plan fails with UnenforceableFeature if a security feature is 'unsupported'
// and not listed in allowDegrade.

// 3. Effect: the only I/O. Idempotent; touches only entries it owns; returns a receipt.
const receipt = yield* apply(p);
yield* revert(receipt); // removes exactly what was written
```

Typed per-target escape hatch for things the portable model refuses to express:

```ts
claude({ settings: { mcpServers: { sourcefed: { alwaysLoad: true } } } }); // typed, Claude-only
opencode({ mcp: { codemode: false } });
```

### Capability model

- **One frozen table per target, keyed by feature,** with entries of the form `{ outcome, versions: ">=2.1.277 <3", verifiedWith: "2.1.302", source: "https://…" }`. No method-presence checks and no flags without consumers.
- **Every outcome comes from one of three values:**
  - `native`: the agent does it.
  - `fallback`: a documented substitute, such as skills on disk instead of over MCP.
  - `unsupported`.
- **Each feature carries a policy class:**
  - `security` (hooks that block): unsupported fails the plan.
  - `functional` (skills, MCP): unsupported is reported.
  - `cosmetic`: reported once.
- **Unknown versions fail the plan** with the supported range, not a guess (Nitro's `compatibilityDate` rule).
- **The docs matrix is generated from the table.** CI fails if the table and the generated doc differ.

### Conformance against the real CLIs

Three layers, mirroring the daemon's proof:

1. **Pure tests:**
   - Golden plans per target and version.
   - Emitted files are validated against each vendor's own schema where one exists: the Agent Plugins schemas, `codex app-server generate-json-schema`, OpenCode's `/v2/openapi.json` config schema, and `claude plugin validate`.
   - Hostile inputs: paths escaping the root, symlinks, oversized files, names that collide after sanitizing.
2. **Discovery tests, no model calls.** Apply into a temporary `HOME`, `CODEX_HOME`, `PI_CODING_AGENT_DIR` and XDG directories, then ask each agent what it loaded:
   - `claude -p --output-format stream-json`: the `system/init` message lists `mcp_servers` and plugins.
   - `codex app-server`: `mcpServerStatus/list`, `skills/list`, `hooks/list`.
   - `opencode serve`: `/api/mcp` and the skill registry.
   - `pi --mode rpc`.
   - `fx mcp list`.

   The test fails if a declared `native` feature is missing.
3. **Behaviour tests, real model, nightly and on demand.** A recorder MCP server writes every call to a file. The test passes only if:
   - each agent calls `recorder.echo` with a token found only in the skill body;
   - the hook bridge records `pre-tool` before the call;
   - a bridge `deny` prevents a second call.

   Evidence comes from the recorder file, never from model text. Agent versions are pinned per run, and a failure on a new upstream version flips its table entry to `unsupported` until reviewed.

### Smallest first vertical slice

**One MCP endpoint, five agents, user scope, plan, apply and revert, proven by discovery tests.**

- Input: an Agent Plugins directory whose `mcp.json` holds one stdio server (a recorder now; `workhorse mcp sourcefed` later).
- Output: native entries in `~/.claude.json`, `~/.codex/config.toml`, `~/.config/opencode/opencode.json`, `~/.pi/agent/mcp.json` and `~/.fx/mcp.json`.
- Proof: layer 2 tests show each real CLI lists the server, `revert` removes exactly that entry, and a hand-edited neighbouring entry survives both operations.

This slice forces the parts everything else depends on: the capability table, plan and receipt, and safe merging into TOML, JSONC and JSON. It is also the step the daemon needs at slice 10 (the MCP framework). Skills (the fallback) come second, and the hook bridge third.

Before building, compare the slice with depending on `add-mcp`'s `upsertServer`. It covers four of the five agents, but adopting it is a production dependency and needs approval.

### Name

| Candidate | npm | GitHub |
| --- | --- | --- |
| `unagent` | **Taken**: onmax, 0.0.8, active | `onmax/unagent` (20 stars); a user named `unagent` exists; `unjs/unagent` returns 404 |
| `@unagent/core` | No package (scope ownership not verified) | — |
| `unagents` | Free | — |
| `@workhorse/agents`, `@workhorse/unagent` | No package (whether the `@workhorse` npm scope is free was not verified) | A GitHub org `workhorse` exists; ownership not checked |
| `unharness` | Taken | — |

Checked with `curl https://registry.npmjs.org/<name>` and `gh api` on 2026-10-21.

---

## 6. Open questions for you

1. **Scope.** Should v0 cover only the residue of the "through Workhorse" path (MCP registration, skill fallback, hook bridge)? Or do you want a general-purpose emitter for third-party authors too, which competes with rulesync?
2. **Name.** Choose between a scoped `@workhorse/agents`, `unagents`, contacting onmax about the name, or something else. Should the verified agent table be offered to onmax/unagent?
3. **Location.** Should this be a sibling workspace (`agents/`) with its own gates, or packages inside `daemon/packages`?
4. **Dependencies (approval required).** Safe merging needs a TOML reader and writer that preserves comments (Codex), a JSONC editor (OpenCode), and YAML frontmatter parsing (skills). Options: add libraries, write minimal parsers, or adopt `add-mcp`.
5. **Skills strategy.** Should Workhorse serve skills over SEP-2640 now and write filesystem copies as the fallback, or keep skills on disk until an agent adopts the extension? Should Workhorse push for SEP-2640 support upstream (OpenCode and pi are open source)?
6. **Hooks.** Is the bridge's fail-closed behaviour acceptable on Claude Code and Codex, whose own hook failures fail open? The bridge would have to turn a daemon timeout into an explicit deny. Should fx's lack of hooks block steering for fx users, or be accepted as degraded?
7. **Trust.** Confirm that `unagent` must never grant project trust or approve MCP servers on the user's behalf, even when asked to "just make it work".
8. **Runtime driving.** When Equestrian or Stable need to drive Claude Code or Codex, is depending on `@ai-sdk/harness-*` or ACP acceptable? Or should the libfx path (spike 5) be the only driver?
9. **Mailbox wake.** Should the per-host adapter that pushes mailbox events into an idle session (OpenCode plugin, pi extension, Claude Code channels or monitors, which were not researched here) live in this package or with each app?
10. **Model-cost tests.** Conformance layer 3 calls real models for five agents. What budget and credentials should the nightly job use?

## Sources consulted

- **Workhorse:** `AGENTS.md`, `ARCHITECTURE.md`, `PHILOSOPHY.md`, `daemon/docs/architecture.md`.
- **Claude Code:**
  - `code.claude.com/docs/en/{mcp,managed-mcp,memory,skills,sub-agents,hooks,permissions,settings,sandboxing,headless,cli-reference}.md`
  - `plugins/{manifest-reference,marketplace-reference,cli-reference}.md`
  - `agent-sdk/*`
  - `@anthropic-ai/claude-agent-sdk` 0.3.306 type definitions
- **Codex:**
  - developers.openai.com/codex: `mcp`, `guides/agents-md`, `skills`, `custom-prompts`, `agent-configuration/{subagents,rules}`, `hooks`, `plugins`, `config-file/config-advanced`, `non-interactive-mode`, `codex-sdk`, `app-server`
  - `openai/codex` at `c7234c1`: `codex-rs/{cli,core,config,hooks,codex-mcp,core-plugins,utils/plugins,external-agent-migration,app-server-protocol}`, `sdk/typescript/src`
- **OpenCode V2:**
  - https://opencode.ai/v2/docs/: `mcp-servers`, `config`, `instructions`, `skills`, `commands`, `agents`, `plugins`, `build/plugins`, `build/plugins/migrate-v1`, `permissions`, `policies`, `cli/commands`, `cli/acp`, `migrate-v1`
  - `anomalyco/opencode` at `4d59657`
- **pi:** `earendil-works/pi` at `16f5f0a`, `packages/coding-agent/docs/{mcp,configuration,skills,prompt-templates,extensions,packages,security,cli,json,rpc,sdk}.md`, and https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/.
- **fx:** https://fx.sh/llms.txt and docs; `vercel-labs/fx` at `a2be4ab`.
- **Standards:**
  - https://modelcontextprotocol.io/specification/versioning, `/extensions/client-matrix`, `/extensions/skills/overview`
  - `modelcontextprotocol/ext-skills` at `c1aa87e`
  - `agentplugins/agent-plugins-spec` at `ff8ab5e` (`spec/1.0.0.md`, `spec/1.1.0.md`, `FUTURE_CONSIDERATIONS.md`)
  - https://agents.md, https://agentskills.io, https://agentclientprotocol.com
- **Prior art:**
  - `onmax/unagent` at `78a4728` and https://unagent.onmax.me
  - https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters
  - READMEs of rulesync, ruler, add-mcp, vercel-labs/skills, cligent, rivet-dev/agents, coder/agentapi
  - npm registry and download API
  - `gh api` repository data
- **unjs:** unplugin 3.4.0, unstorage 2.0.0-beta.0, unenv 2.0.0-rc.24, db0 0.4.1, crossws 0.4.15, c12 4.0.0-rc.2, hookable 6.1.2, Nitro 3.0.260903-beta (source on `main`, 2026-10-21).
