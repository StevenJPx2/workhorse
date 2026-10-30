# Harness adapters: one hook layer for every coding agent

Research spike, 2026-10-27, written for the Chauffeur v2 plan (`StevenJPx2/chauffeur`, branch `v2`, `docs/plans/pluggability.md`, section "Adapters"). No code was built. Facts come from official docs, source code read at a named commit, registry data, or a local command whose output is quoted. **(inferred)** marks anything not confirmed against a primary source.

A one-page summary of every capability across the four harnesses is in [MATRIX.md](MATRIX.md).

Companion to [FINDINGS.md](FINDINGS.md), which covers install-time generation (`@workhorse/agents`) and records the decisions of 2026-10-21. This file covers the runtime half: hooking a running harness, and acting on it.

> **Superseded in part on 2026-10-27.** The design is now an unplugin-style SDK: each author's plugin becomes a native plugin in each agent ([README.md](README.md)). These parts no longer apply:
>
> - the fan-out adapter, registered deciders and the combining rules (summary point 6, sections 1 and 6, the decider SDK in section 8);
> - deciders holding their own queues (section 5). The SDK keeps queued actions per plugin and session instead.
>
> The fidelity tables, event coverage, failure and timing data, delivery paths and the per-agent multi-plugin table in section 6 still hold.
>
> **Update, 2026-10-30:** plugins built with `@workhorse/tack` coordinate again, through one host per agent process or one runner per hook event. The combining rules in section 6 apply to them once more, with tack plugins in place of deciders. The per-agent table in section 6 now describes how the tack host combines with plugins not built with tack.

## Versions checked

| Harness | Version | Evidence |
| --- | --- | --- |
| OpenCode V2 | CLI 2.1.4 | `opencode --version` gives `opencode v2.1.4`. Source `anomalyco/opencode` at `f993a89` (default branch, 2026-10-27). Docs: https://opencode.ai/v2/docs/build/plugins/server, `/plugins/rpc`, `/permissions`, `/warming` |
| Pi | 1.4.0 | `pi --version` gives `1.4.0`. Source `earendil-works/pi` at `16f5f0a` (2026-10-21), read through `gh api`. The 1.4.0 changelog (released 2026-10-21) changes no extension event or action, except that `before_provider_headers` no longer sees attribution headers |
| Claude Code | 2.1.310 | `claude --version` gives `2.1.310 (Claude Code)`. Docs: `code.claude.com/docs/en/{hooks,plugins/mods/events,plugins/mods/api,plugins/mods/reference,plugins/mods/admin,cross-session-messaging,channels}.md`, and the mods type file `claude-code.d.ts` (its header says 2.1.277) |
| Codex | 0.164.0 | `codex --version` gives `codex-cli 0.164.0`. Source `openai/codex` at `c7234c1`, read through `gh api`. Docs: https://developers.openai.com/codex/hooks, `/codex/app-server` |

The local clones for Pi, Codex and OpenCode that FINDINGS.md used turned out to be empty directories. Every source claim here was re-read from GitHub at the commit named.

I checked these claims myself against the downloaded docs:

- Claude Code: `onFailure`, `asyncRewake`, timeouts, `idle_prompt` timing, `deny > defer > ask > allow`, the messaging socket and mod `.catch`.
- Codex: concurrency, the 600-second default, exit 2 with stderr, and fail-open on errors.

Subagents read the rest and cite file and line.

---

## Summary

1. **One universal package is feasible, and it should be one package family with the install-time emitter.**
   - The shared part is a contract held as data: events, actions, the fidelity table and the decision-combining rules. Rust (Chauffeur's engine) and TypeScript can both read it.
   - Around the contract sit one thin shim per harness and one hook command.
   - Proposed name: `@workhorse/harness`, in the same `agents/` sibling workspace as `@workhorse/agents`, which installs the shims. That fits decisions 6 and 9 of FINDINGS.md: hooks fail closed, and mailbox-wake adapters live in that package.
   - Each consumer keeps its own policy and state.
2. **The brief's tables are mostly right, with 17 corrections** ([section 2](#2-fidelity-verified)). These matter most:
   - Pi's `next` is `deliverAs: "nextTurn"`.
   - Claude Code mods can append and wake natively (`$.session.append`, `$.prompt.submit`).
   - OpenCode has no per-session warm action and no resume event.
   - Codex's "unsupported" cells are unsupported only for hooks; its app-server has every one of them.
   - `session.resumed` currently mixes two meanings.
3. **Events: add three.**
   - `compaction.before`/`compaction.after`: all four harnesses have them.
   - `session.ended`: all four have it.
   - `reason` on `response.finished` (`done | aborted | error`) instead of a separate interrupt event.

   Subagents need `agent` and `parent` fields on every event rather than new events. Model-request hooks stay out of the standard set for now.
4. **Fail-closed is enforceable everywhere, but by different means.** Each harness has a single path that refuses the action on failure:
   - Claude hooks: `onFailure: "block"`, since 2.1.295.
   - Claude mods: `.catch`.
   - Pi: a thrown `tool_call`.
   - OpenCode: a thrown `execute.before`.
   - Codex: none. Codex fails open on any hook error, so the hook command must turn every internal failure into an explicit deny itself. If the binary is missing or crashes before printing, the call goes ahead, and nothing can prevent that.

   OpenCode and Pi have no hook timeouts at all, so the shim must impose the budget.
5. **Delivery without a connection has better options than queueing, but none is universal:**
   - Codex: app-server `turn/steer`, `turn/start` and `thread/inject_items`, where the session runs under an app-server the adapter can reach.
   - Claude Code: the per-session messaging socket (`CLAUDE_CODE_MESSAGING_SOCKET`), which starts a turn in an idle session, and `asyncRewake`.

   MCP notifications reach the model in none of the four harnesses. Queueing to the next hook remains the baseline.
6. **Run one adapter per harness, and let it fan out to several deciders.** Several plugins in one harness combine badly:
   - OpenCode: last write wins.
   - Pi: the first block wins, and a later result overwrites `reason`.
   - Codex: rewrites are racy.
   - Claude: the merging of rewrites is undocumented.

   The adapter combines in two phases, as Kubernetes admission does. Rewrites run in priority order. Verdicts are combined as `deny > ask > allow`, and an explicit deny wins whatever any decider's failure policy says.
7. **Prior art:**
   - Align with ACP's JSON-RPC conventions and the AI SDK's capability-table style.
   - Take design rules from `dsh-hook-protocol`, Kubernetes admission and Cedar.
   - Use rulesync's per-harness event maps as test fixtures.
   - Do not depend on any of them. None hooks in-process harnesses with actions; they are CLI-hook-only, outside-in, or experimental.

---

## 1. One universal package

### What is shared and what is not

| Layer | Shared? | Holds |
| --- | --- | --- |
| Contract | **Yes, as data** | Event and action schemas, the JSON-RPC methods between adapter and decider, the fidelity table, the combining rules. JSON Schema plus JSON, so Chauffeur's Rust daemon and TypeScript consumers read the same files |
| Shims | **Yes, one per harness** | An OpenCode server plugin, a Pi extension and a Claude Code mod. Each one translates hooks to events and actions to harness calls, enforces budgets, and combines decisions. No policy |
| Hook command | **Yes, one** | Used by Codex, and by Claude Code when mods are off. Reads the hook JSON on stdin, asks the deciders, prints the harness's reply, and turns its own failures into a deny |
| Decider SDK | **Yes** | What a consumer imports to receive events and send actions |
| Install | `@workhorse/agents` | Writes the shim registration and the hook entries into each harness, with plan, apply and revert. Never grants trust (decision 7) |
| Policy, state, queues | **No: each consumer** | Chauffeur's rules, judges and plugin supervisor; sourcefed's triage; opencode-history's recall; Workhorse's policy, Decide and mailboxes |

The adapter holds no queue. For hook-command harnesses, each decider keeps its own pending actions, and the hook command collects them at each hook with a `drain` call that names what this hook can carry (see [section 5](#5-delivery-without-a-connection)). The adapter therefore stays stateless and has nothing to lose in a crash.

### Relation to `@workhorse/agents`

They are the same package family, and they share one fidelity table.

| Package | When it runs | Does |
| --- | --- | --- |
| `@workhorse/agents` (decided 2026-10-21) | Install time | Plans and writes per-agent files, including the shim registration and hook entries from this package |
| `@workhorse/harness` (proposed) | Run time, inside or beside the harness | Events out, actions in, decision combining, budgets |

FINDINGS.md section 5 sketched a "hook bridge" and per-host mailbox-wake adapters. This package is that bridge, generalized so it is not specific to Workhorse. Workhorse's daemon becomes one decider among several:

- Its hook bridge is a `before` handler that calls Decide.
- Its mailbox wake turns `mailbox.deliver` into `message.append` with `wake`, and acknowledges after the action result.

### Name and home

| Option | For | Against |
| --- | --- | --- |
| **`@workhorse/harness` in `agents/` (recommended)** | One place for per-harness knowledge; the fidelity table is not duplicated; decisions 2 and 3 already chose the scope and the workspace | Chauffeur would depend on a package with Workhorse's name (scope ownership on npm not verified; the name returned 404 on 2026-10-27) |
| A neutral name, such as `harnesswire` or `hookwire` (both 404 on npm on 2026-10-27) | Reads as shared infrastructure | A second brand for one table |
| Inside Chauffeur (`@fdcn/chauffeur/adapter`, today's plan) | Already designed | sourcefed, opencode-history and Workhorse would depend on Chauffeur; and Chauffeur's daemon would become everyone's hub |

Taken: `agent-hooks`, `agent-adapters` (npm 200 on 2026-10-27).

### Boundary rules

- **The adapter carries no policy.** It never decides. When no decider answers, the outcome comes from the failure policy the decider registered, not from the adapter.
- **Host denials always win.** The adapter never turns a harness deny into an allow. OpenCode already evaluates a configured deny before `permission.evaluate` runs (`core/src/permission.ts:160-175`).
- **Deciders come only from user configuration**: a user-only file, never from a project. They are trusted code, as the user runs them.
- **The transport is a Unix socket in a `0700` directory**, as Chauffeur plans. The adapter connects to each registered decider socket and holds no tokens or ports.
- **Everything is bounded:**
  - the number of deciders;
  - each `before` budget;
  - pending actions per decider and session;
  - context bytes per hook. Codex spills `additionalContext` above 2,500 tokens to disk.

---

## 2. Fidelity, verified

Legend:
- **native**: the harness does it.
- **fallback**: a documented substitute, described in the cell.
- **derived**: computed by the library from other events.
- **unsupported**.

Claude Code has two columns, because organizations can turn mods off (`allowManagedModsOnly`, `--safe-mode`, an untrusted folder, or three worker crashes).

### Events

| Event | OpenCode 2.1.4 (plugin) | Pi 1.4.0 (extension) | Claude Code 2.1.310, mod | Claude Code 2.1.310, hook command | Codex 0.164.0 (hook command) |
| --- | --- | --- | --- | --- | --- |
| `session.created` | native: event `session.created` (`parentID`, `agent`, `model`) | native: `session_start` with `reason` `startup`, `new` or `fork`. `reload` is not a new session | **fallback**: `session.start` fires once per mod load, not after `/clear`, `/resume` or `/branch`. `classic.SessionStart` covers them, but does not run where the built-in guard loads | native: `SessionStart`, `source` `startup`, `clear` or `fork` | native, **late**: `SessionStart` `startup` is deferred to the first turn |
| `prompt.sent` | native: hook `session.prompt` (user prompts and commands only; synthetic messages skip it) | native: `input` for edits and blocks (filter `source: "extension"`); `before_agent_start` for appends | native: `prompt.submit` | native: `UserPromptSubmit` | native: `UserPromptSubmit` |
| `tool.before` | native: `tool.execute.before` (also for Code Mode tools) | native: `tool_call` | native: `tool.call`, before `next` | native: `PreToolUse` | native: `PreToolUse`. Hosted tools such as `WebSearch` never fire it |
| `tool.after` | native: `tool.execute.after` (`status` completed or error) | native: `tool_result` | native: `tool.call`, after `next` | native: `PostToolUse`, `PostToolUseFailure` | native: `PostToolUse` |
| `permission.asked` | native: hook `permission.evaluate` decides before the prompt; event `permission.asked` observes | unsupported: no permission layer (`docs/security.md`) | native: `tool.check`, after `PreToolUse`, before the prompt or classifier | native: `PermissionRequest` | native: `PermissionRequest` |
| `response.finished` | native: `session.execution.succeeded`, `.failed`, `.interrupted` | native: `agent_settled` (`aborted`). Not `agent_end`, which is one low-level run | native: `turn.complete` (`reason`, `isAborted`; `agentId` set for subagents) | fallback: `Stop`. It does not fire on interrupt; API errors go to `StopFailure` | fallback: `Stop`. It does not fire on interrupt, which has its own `Interrupt` event |
| `session.idle` (user quiet) | derived. `session.status{idle}` is harness idle, not user quiet | derived. `agent_settled` is harness idle | derived (no mod idle event) | derived, or `Notification` `idle_prompt` (about 60 seconds after a response, only when the user seems away) | derived, by the decider: no harness process exists to run a timer |
| `session.resumed` | unsupported: no resume event | native: `session_start` `resume` | fallback: `classic.SessionStart` | native: `SessionStart` `resume` | native, late: `SessionStart` `resume`, deferred to the first turn |

### Actions

| Action | OpenCode | Pi | Claude Code, mod | Claude Code, hook command | Codex, hook command |
| --- | --- | --- | --- | --- | --- |
| `message.append` `now` | native: `session.synthetic({delivery: "steer"})`, at the next step boundary | native: `pi.sendMessage(m)`, steered after the current tools | native: `$.session.append`. The model reads it on the next request | fallback: `additionalContext` on the next `PreToolUse` or `PostToolUse` | fallback: `additionalContext` on the next `PreToolUse` or `PostToolUse` |
| `message.append` `next` | native: `delivery: "queue"`; or `instructions.entry.put` for context with no turn | native: `sendMessage(m, {deliverAs: "nextTurn"})` | native: `prompt.submit` `context` | fallback: `UserPromptSubmit` `additionalContext` | fallback: `UserPromptSubmit` or `SessionStart` `additionalContext` |
| `message.append` `wake` | native: `prompt` or `synthetic` on an idle session resumes by default | native: `sendMessage(m, {triggerTurn: true})`; at settle, `agent_before_settle` returns `continue: true` | native: `$.prompt.submit`. It waits for idle, then starts a turn | fallback, three ways: `Stop` block (turn end only; at most 8 in a row); post to `CLAUDE_CODE_MESSAGING_SOCKET` (an idle session starts a turn); an `asyncRewake` hook exiting 2 | fallback: `Stop` `decision: "block"`, turn end only. An idle session cannot be woken through hooks |
| Block a prompt | native: throw in `session.prompt` **(inferred**: a failed prompt preparation is not admitted) | native: `input` returns `{action: "handled"}` | native: `{drop}` | native: `decision: "block"` | native: `decision: "block"` |
| Rewrite prompt text | native: mutate `prompt.text` | native: `input` `transform` | native: `next({...e, text})` | unsupported | unsupported |
| Block a tool call | native: throw in `execute.before`; the model sees a `Tool.Error` | native: `{block: true, reason}` | native: `{deny}` | native: `permissionDecision: "deny"`, or exit 2 | native: `permissionDecision: "deny"`, or exit 2 with a non-empty stderr |
| Rewrite tool input | native: assign `event.input` (and `event.tool`) | native: mutate `event.input`, with no revalidation | native: `next({...e, ...input})` | native: `updatedInput` | native: `permissionDecision: "allow"` plus `updatedInput`. **A rewrite is also an allow** |
| Ask the user before a tool | fallback: `permission.evaluate` with `effect: "ask"`; not possible from `execute.before` | native when `ctx.hasUI`: `ctx.ui.confirm`. Print and JSON modes must block instead | native: `$.ui.ask`. It rejects in `-p` | native: `permissionDecision: "ask"` | unsupported. Fallback: deny with a reason telling the agent to ask |
| `permission.reply` | native: `permission.reply({decision: "once" \| "always" \| "reject", message})` | unsupported (no permission layer) | native: `tool.check` returns `{decision}` | native: `PermissionRequest` `decision.behavior` | native: `PermissionRequest` `decision.behavior` (`allow`, or `deny` with a message) |
| `session.create` | native: `session.create({parentID?, …})` | fallback: `newSession` from command handlers only; RPC `new_session` | unsupported | unsupported | unsupported (app-server `thread/start`) |
| `session.update` (model) | native: `switchModel`, `switchAgent` | native: `pi.setModel` | native, per request: `turn.step`, `next({...e, model})` | unsupported | unsupported (app-server `thread/settings/update`, experimental) |
| `session.compact` | native: `compact({delivery})` | native: `ctx.compact()` | native **(completion unconfirmed)**: `$.session.compact({instructions})`, between turns only | unsupported (`PreCompact` can only block) | unsupported (`PreCompact` can veto; app-server `thread/compact/start`) |
| `session.warm` | fallback: the `warming` config only, with no per-session call | fallback: `cache_warming_decision` can allow or veto a refresh Pi has already scheduled; the last handler wins | unsupported | unsupported | unsupported |
| `session.interrupt` | native: `interrupt({resume?})` | native: `ctx.abort()` | native: `$.turn.abort({turnId})` | fallback: `continue: false` at the next hook | unsupported (app-server `turn/interrupt`; the `Interrupt` hook only observes) |
| `session.remove` | native: `remove` (children too) | unsupported | unsupported | unsupported | unsupported (app-server `thread/delete`) |
| Registries | native: `tool`, `skill`, `command`, `mcp`, `model`, `provider` via `ctx.<x>.transform`; agents update and remove only (adding one is unconfirmed) | native: `registerTool`, `registerCommand`, `registerMcpServer`, `registerProvider`; skills via `resources_discover`; no agents | native: `$.tool.register`, `$.command.register`, `$.agent.register` | unsupported | unsupported: static files, written at install time by `@workhorse/agents` |

### Corrections to the brief

1. **Pi `next`** is `sendMessage(m, {deliverAs: "nextTurn"})` (`agent-session.ts:1923`). A message returned from `before_agent_start` goes into the run that is starting, so it is a hook-time injection, not a queue.
2. **Pi compaction is native:** `ctx.compact()`, and RPC `compact`. `session_before_compact` can cancel it or supply the summary.
3. **Pi's Stop analogue is `agent_before_settle`**, which can return `{continue: true}`. `agent_settled` is the final idle signal.
4. **Pi `session.warm` is only a veto or an allow** of a refresh Pi has already scheduled (`cache-warmer.ts:112-120`). Pi refreshes only within a 30-minute idle window. It cannot start a warm-up on demand.
5. **OpenCode `session.warm` is not an action.** Warming is a config setting (`"warming": true | {prompt, interval, duration}`) with no per-session control. `session.generate` could act as a manual warm-up **(inferred, undocumented as such)**.
6. **OpenCode has no `session.resumed` event.**
7. **OpenCode cannot ask the user from `execute.before`.** Use `permission.evaluate` with `effect: "ask"`. The permission check runs inside the tool, after `execute.before`, so it sees the rewritten input **(inferred)**.
8. **OpenCode's `now` lands at the next step boundary**, not in the middle of a stream **(inferred)**.
9. **Claude Code `now` is native with mods:** `$.session.append`. "Context on the next tool result" is only the hook-command fallback.
10. **Claude Code `wake` with mods is not limited to turn end.** `$.prompt.submit` waits for idle, then starts a turn.
11. **Claude Code compaction exists in mods**: `$.session.compact`. It runs between turns, rejects during a turn, and resolves `{skip}` on a veto. The completion signal is unconfirmed.
12. **Claude Code mods miss `/clear`, `/resume` and `/branch`** for session start. Use `classic.SessionStart`, or the hook command.
13. **Claude Code hooks support `ask` natively** (`permissionDecision: "ask"`), so asking the user does not require mods.
14. **Codex `now` can ride on `PreToolUse` too**, which comes earlier than `PostToolUse`.
15. **Codex `SessionStart` is deferred to the first turn.** It does not fire at thread start or resume.
16. **Codex rewrite requires `allow`.** `updatedInput` without `permissionDecision: "allow"` is an error. A decider that only means "rewrite" therefore also approves the call **(inferred: this skips Codex's own approval prompt for that call)**. The adapter must only rewrite when the combined verdict is `allow`.
17. **`session.resumed` currently mixes two meanings.** The brief maps it to `SessionStart` `resume`, which means a stored session was reopened. Chauffeur's event table gives it `idle_seconds` and `cache_seconds`, which means the user came back after a pause, and that is what the context-renewal plugin needs. Recommendation: keep `session.resumed` for "reopened from storage", and put `idle_seconds` (time since the last `response.finished`) on `prompt.sent`, computed by the library. A `before` handler on `prompt.sent` can then compact before the turn starts.

### The table as data

One JSON file per harness and per path (in-process or hook command). Both the adapter and its callers read it, and `@workhorse/agents` uses the same file to plan installation:

```json
{
  "schema": 1,
  "harness": "codex",
  "path": "hook-command",
  "versions": ">=0.163.0 <0.170.0",
  "verifiedWith": "0.164.0",
  "verifiedAt": "2026-10-27",
  "cells": {
    "message.append.now": {
      "fidelity": "fallback",
      "when": "next-tool-call",
      "how": "additionalContext on the next PreToolUse or PostToolUse",
      "source": "https://developers.openai.com/codex/hooks"
    },
    "message.append.wake": {
      "fidelity": "fallback",
      "when": "turn-end",
      "how": "Stop with decision: block; an idle session cannot be woken",
      "source": "https://developers.openai.com/codex/hooks"
    },
    "tool.before.ask": {
      "fidelity": "fallback",
      "when": "immediate",
      "how": "deny with a reason that tells the agent to ask the user",
      "source": "codex-rs/hooks/src/events/pre_tool_use.rs@c7234c1"
    },
    "session.compact": { "fidelity": "unsupported", "source": "https://developers.openai.com/codex/hooks" }
  }
}
```

The rules carry over from FINDINGS.md section 3:

- **Every cell has a source.** An unknown harness version fails with the supported range instead of a guess.
- **`when` is a closed set:** `immediate | next-step | next-tool-call | next-prompt | turn-end | never-idle`. A caller can then tell "it will arrive late" apart from "it will not arrive".
- **The docs matrix is generated from these files.**
- **A conformance run against a new harness version that fails a cell flips it to `unsupported`** until someone reviews it (decision 10: nightly, capped budget).

---

## 3. Event coverage

| Candidate | OpenCode | Pi | Claude Code | Codex | Standardize? |
| --- | --- | --- | --- | --- | --- |
| Compaction | hook `session.compaction` (can supply the result); events `session.compaction.started`, `.ended`, `.failed` | `session_before_compact` (cancel, or a custom summary), `session_compact`, `session_compact_failed` | `PreCompact` (block), `PostCompact` (summary); mod `session.compact` | `PreCompact` (veto), `PostCompact` | **Yes:** `compaction.before` (veto, instructions) and `compaction.after` (summary). Context-renewal and recall both need them |
| Session ended | `session.deleted`, `.archived` | `session_shutdown` (`reason`) | `SessionEnd` (1.5-second shared budget); mod `session.end` | `SessionEnd` (1-second default, 3-second cap) | **Yes:** `session.ended`, observe only, for releasing leases, mailboxes and connections |
| Interrupt | `session.execution.interrupted` (`reason`) | `agent_settled.aborted` | `turn.complete.isAborted`; hook: none | `Interrupt` (observe only, 1–3 seconds) | **As a field:** `response.finished.reason: done \| aborted \| error`, as in ACP's stop reasons. Not a new event |
| Subagents | child sessions with `parentID`; `subagent` is a normal tool | none (`parentToolCallId` on nested calls only) | `SubagentStop`; mod `agent.spawn`, `agentId` on events | `SubagentStart`, `SubagentStop` | **As fields:** `agent` and `parent` on every event. `subagent.started`/`finished` can wait until a consumer needs them |
| Model request | `model.request`, `http.request`, `http.response` | `before_provider_request` (replace payload), `after_provider_response` | mod `turn.step` (change model per request) | `PreModelRequest`, `PostModelRequest` (observe only, undocumented) | **Not yet.** Only Chauffeur's per-request model routing needs it, and two harnesses can only observe. Keep it per-harness behind `session.update` |
| Errors | `session.execution.failed`, `session.step.failed` | `extension_error` records; `session_compact_failed` | `StopFailure`, `PostToolUseFailure` | hook status `Failed` | **As a field:** `response.finished.reason: error`, and `tool.after.error` |
| Notifications, elicitation | `permission.*`, form events | `ui_prompt_start`/`end` | `Notification` (13 types), `Elicitation` | none | **No.** These are UI matters; FINDINGS.md section 6 covers them |

---

## 4. Failure and timing

| | OpenCode | Pi | Claude Code, mod | Claude Code, hook command | Codex, hook command |
| --- | --- | --- | --- | --- | --- |
| Hook timeout | **none** (`PluginHooks.trigger` is a plain sequential loop, `hooks.ts:88-95`) | **none** (`runner.ts` has no timer) | 10 seconds of the hook's own run time, not counting `next` and `$.*` calls; 50 ms for `prompt.edit` | 600 seconds by default; 30 on `UserPromptSubmit`; 1.5-second shared budget on `SessionEnd`; `async` hooks are not timed | 600 seconds by default; 1 second (3-second cap) on `SessionEnd` and `Interrupt` |
| A throw, crash or timeout | `execute.before`: the call fails (closed). Other hooks: a defect that aborts the surrounding operation **(inferred)** | `tool_call` and `user_bash`: blocked (closed). Every other event: reported and skipped (open) | Skipped; the next handler runs (open). Three worker crashes unload all non-built-in mods | Not blocking (open), except exit 2 or `onFailure: "block"` | Not blocking (open). Only a valid deny, or exit 2 with a non-empty stderr, blocks. The process group is killed on timeout |
| Fail closed is possible by | throwing in `execute.before` | throwing in, or returning `block` from, `tool_call` | `.catch` returning `{deny}` or `{decision: "deny"}` when `!next.called` (1-second budget) | `onFailure: "block"` (2.1.295+; not on `Stop`, `SubagentStop` or async hooks) | the command printing a deny for every internal failure. A missing or crashing binary still fails open |
| The shim must | race the deciders against the budget, then apply `onTimeout` | the same; and check `ctx.hasUI` before asking | use `.catch`; make a `before` budget fit inside 10 seconds of the hook's own time | set `timeout` and `onFailure: "block"` on guard hooks | keep its own deadline below the hook `timeout`, so it always prints an answer |

### Latency budget for the hook command

The hook command runs synchronously on every matched tool call, and Codex launches matching hooks concurrently. The command's own overhead adds to every tool call, before any decider runs.

Measured on this machine: mean wall time of 30 runs after 3 warm-ups, from the script at `…/T/opencode/verify/startup.sh`.

| Process | Mean |
| --- | --- |
| `/usr/bin/true` | 2.2 ms |
| `bun -e 0` (Bun 1.4.4) | 7.0 ms |
| `node -e 0` (Node 26.12.1) | 59.3 ms |

Proposed budget:
- **Overhead:** at most 20 ms at p99, from process start to the answer, not counting decider time.
- **Implementation:** Node misses that budget; a Rust binary such as Chauffeur's, or a Bun executable **(inferred: `bun build --compile` starts close to `bun -e 0`)**, meets it.
- **Timeouts:**
  - Each decider gets its own registered `before` budget.
  - The command's own deadline is the largest budget plus 200 ms.
  - The harness `timeout` it registers is that deadline plus 1 second, rounded up to whole seconds, because both Codex and Claude Code count `timeout` in seconds.

---

## 5. Delivery without a connection

Ranked best first. Each row says what it gives over queueing to the next hook.

| Path | Harness | Gives | Limits | Use |
| --- | --- | --- | --- | --- |
| **Messaging socket** | Claude Code | A true wake. The session's Unix socket path is exported to hooks as `CLAUDE_CODE_MESSAGING_SOCKET`. An idle session "starts a new turn with the message"; a busy one reads it between tool calls (`cross-session-messaging.md`) | Plain text only. `crossSessionInbound` controls acceptance, and messages verified as coming from the session's own children are delivered by default. A decider daemon is not a child, so it probably needs `accept` **(inferred)**. The posting protocol beyond an optional `{"type":"auth","token"}` line is undocumented | Spike first. The hook command records the socket path per session and hands it to deciders |
| **App-server** | Codex | `turn/steer` (now), `thread/queue/add` (next; experimental), `turn/start` (wake), `thread/inject_items` (append without a turn); plus `thread/compact/start`, `turn/interrupt` and `thread/settings/update` | Only where the session runs under an app-server the adapter can reach: Codex desktop, the IDE extension, or `codex --remote`. Whether a second client may steer a thread another connection owns is undocumented **(inferred: needs a runtime test)** | An opt-in "live" tier. When it is reachable, its cells upgrade from `fallback` to `native` |
| **`asyncRewake` hook** | Claude Code | A background hook that exits 2 wakes Claude, and its output becomes a system reminder | Its `timeout` is enforced, so it must be re-armed, and every wake costs a process | A last resort for wake |
| **Channels** | Claude Code | An MCP server pushes events into a running session | Research preview. Needs claude.ai or Console sign-in, `--channels`, and organization enablement | Not for a base layer |
| **Queue to the next hook** | Codex, Claude Code hooks | Works everywhere | `now` waits for the next tool call, `next` for the next prompt, and `wake` for the turn end. An idle session never wakes | The baseline |
| MCP notifications | all four | Nothing. None of the four puts a server notification in front of the model (OpenCode: `mcp/client.ts:172-225`; Codex: `logging_client_handler.rs`; Pi: `mcp.md`) | — | Do not use |

How queueing works without a hub:

- **Deciders keep their own queues.** Each decider holds its pending actions, keyed by session, with the session revision they were made against.
- **The hook command drains them.** At each hook it sends every subscribed decider `drain(session, carries)`, where `carries` is what this hook can deliver. `PreToolUse` and `PostToolUse` carry `now`. `UserPromptSubmit` and `SessionStart` carry `next`. `Stop` carries `wake`.
- **Stale actions are dropped.** Anything older than the session's current revision is dropped and reported `stale`. A `now` append whose turn has ended becomes `next` only if it was sent with `late: "next"`, as the brief's retry rules say.
- **Results go back to the decider.** Workhorse acknowledges a mailbox event only after the result `delivered`.

---

## 6. Several consumers at once

### Why not one plugin per consumer

| Harness | What happens with several plugins on the same hook |
| --- | --- |
| OpenCode | Plugins run sequentially. Each sees the previous one's changes, and the last write wins on `input`, `effect` and `result`. A later plugin could undo a policy deny set by an earlier one **(inferred)** |
| Pi | Extensions run sequentially. The first `block` short-circuits, but a later truthy result overwrites an earlier one, so `reason` and `terminate` can be lost (`runner.ts:1257`) |
| Claude Code hooks | Hooks run in parallel, with `deny > defer > ask > allow` and every `additionalContext` delivered. How conflicting `updatedInput` values merge is undocumented |
| Claude Code mods | One middleware chain: the first mod decides whether the rest run. Managed `PreToolUse` hooks run before mods; other `PreToolUse` hooks run after the last mod, so a mod that answers without `next` skips them |
| Codex | Hooks run concurrently. Any deny wins. Among rewrites, whichever hook finishes last wins, which is a race (`pre_tool_use.rs:149-167`) |

Three or four plugins per harness give four different combining rules, plus races. **So install one adapter per harness, registered once per event, and have it fan out to every subscribed decider.**

### Registering a decider

Deciders are listed in a user-only file and never come from a project. Each entry has:
- a name;
- a socket path;
- the events it hooks;
- for each `before`: a budget and an `onTimeout`;
- a priority;
- the state it owns, for example `session.update.model`.

Two deciders claiming the same owned state is an error when the file is loaded, not a race at run time.

### Combining rules

| Point | Rule | Precedent |
| --- | --- | --- |
| `tool.before` | **Phase 1, rewrite:** deciders run in priority order, and each sees the input as rewritten so far. **Phase 2, verdict:** every decider sees the final input in parallel; `deny > ask > allow > no opinion`. An explicit deny always wins, whatever its failure policy. A decider that fails or times out contributes its `onTimeout`. A rewrite goes out only if the combined verdict is `allow` (needed for Codex) | Kubernetes admission (mutate, then validate; `failurePolicy`), Claude Code, Cursor, Cedar (forbid overrides permit) |
| `prompt.sent` | Any block wins. Text edits run in priority order. Appends are concatenated in priority order and de-duplicated by key, within a byte cap | Cursor (concatenate messages), `dsh-hook-protocol` (accumulate context in order) |
| `permission.asked` | Any deny wins. All allow: allow. Otherwise the request is left to the user | Codex `PermissionRequest`, Cedar |
| `compaction.before` | Any veto wins. Instructions are concatenated | Pi `session_before_*` (first cancel wins) |
| Actions (`message.append`, `session.*`) | Not combined. Each is carried out as its decider asked, ordered per decider. State actions are accepted only from the declared owner | Chauffeur's retry table |
| Errors | Recorded with the event as paired `invoked`/`result` audit entries, then skipped unless the failure policy says block | `dsh-hook-protocol`, Cedar diagnostics |

Each decider gets its own budget, so one slow consumer delays only the decisions it takes part in. The adapter answers when every decider has answered or the deadline has passed, whichever comes first.

---

## 7. Prior art

| Project | Version and adoption | What it is | Adopt, align or avoid |
| --- | --- | --- | --- |
| AI SDK harness adapters | `@ai-sdk/harness` 1.0.165 (2026-10-26, experimental); about 20k downloads a week per adapter | Drives harnesses from outside: sessions, stream parts, `toolApproval`, a capability table. Lifecycle callbacks only observe ("callback errors are ignored") | **Align** with its capability-table style and its loud `HarnessCapabilityUnsupportedError`. **Avoid** depending on it: it does not hook in-process and has no pre-tool rewrite |
| ACP | v1 stable (schema 1.26.0); v2 draft (`schema-v2.0.0-alpha.9`); `@agentclientprotocol/sdk` 2.0.2 | JSON-RPC 2.0 between editor and agent: `session/update`, `session/request_permission`, `session/cancel`, stop reasons. The "Agent Extensions via ACP Proxies" RFD (draft) proposes proxy chains | **Adopt** its conventions: `_meta` with `traceparent`, preserving unknown variants, a permission `subject` union, stop reasons. **Avoid** using the proxy chain as the fan-out model: a linear chain has no rule for combining parallel verdicts. An ACP bridge can come later for ACP-native harnesses |
| `@deepseek-ai/dsh-hook-protocol` | `latest` 0.0.1-rc.1, `next` 0.2.1-rc.4; tied to its own monorepo | Runs Claude- and Codex-style command hooks: exit 2 blocks, the merge is `deny > ask > allow`, paired `hook/invoked` and `hook/result` records. It parses `updatedInput` but does not apply it | **Adopt** its rules: never throw into the agent loop, a most-restrictive merge, paired audit records. **Avoid** the dependency |
| rulesync | 43.1.1 (2026-10-27); about 180k downloads a week | Generates hook files from about 56 canonical events, with per-tool support lists and rename maps. Unsupported events are skipped with one warning per target | **Adopt** its per-harness event maps as test fixtures, and its explicit support lists. **Avoid** its union-of-every-field schema. It is install-time only |
| Agent Plugins | 1.0.0, 1.1.0 draft | Packaging. Spec 1.1.0 keeps hooks out "until their formats converge" | **Align** on packaging only |
| Cursor, Copilot CLI, Gemini CLI | — | Cursor reads Claude Code hooks, accepts both Claude's nested and its own flat output, and has `failClosed`. Gemini uses the same stdin, stdout and exit-2 shape | **Align:** the hook command accepts the Claude/Codex output shape. That gives Cursor and Gemini-style harnesses at low cost later |
| a5c-ai `hooks-adapter-*` 6.0.0 (in `a5c-ai/babysitter`, 1,872 stars) | `hooks-adapter-core` 7.6k downloads a week | A canonical event model with 43 phases, shell-hook and in-process families, a handler registry with priority fan-out, and a most-restrictive merge. Tested in [A5C-SPIKE.md](A5C-SPIKE.md): a deny does not block in Codex 0.164.0 (its renderer emits `decision: "deny"`); crashes and timeouts become `noop`; the Pi output isn't Pi's shape; nothing acts on a session between hooks | **Align** with its phase names and merge table. **Avoid** depending on it. Report the Codex renderer bug upstream |
| agentseam, hitch, sondera | 2 to 230 stars | Normalized events and decisions for command hooks. agentseam keeps a per-agent enforcement matrix and degrades a `transform` to `escalate` rather than passing silently. hitch keeps the raw `source_payload`. sondera fails closed when its server is unreachable | **Adopt** agentseam's "degrade, never silently pass" rule, and keep the raw native payload on every event. **Avoid** them as dependencies: they cover command hooks only, with no in-process actions |
| Kubernetes admission, Cedar | — | Mutate-then-validate with per-webhook `timeoutSeconds` and `failurePolicy`; an explicit rejection wins regardless of failure policy. Cedar: forbid overrides permit, default deny, errors skipped with diagnostics | **Adopt** the combining rules in [section 6](#combining-rules) |

The gap is narrower than it first looks, but it is real. a5c-ai hooks in-process harnesses (Pi, OpenCode) as well as command-hook ones, but it carries no actions back (append, wake, compact, interrupt, switch model) and fails open. The other normalizers stop at stdin and stdout command hooks.

---

## 8. Recommended shape

```text
agents/                              # sibling workspace, decision 3
└── packages/
    ├── agents/        @workhorse/agents: install-time plan, apply, revert (FINDINGS.md section 5)
    └── harness/       @workhorse/harness
        ├── schema/        events.json, actions.json, rpc.json, fidelity/<harness>.<path>.json  (data; Rust reads these too)
        ├── src/protocol   JSON-RPC envelope, combining rules, revision checks; no I/O
        ├── src/fidelity   reads schema/fidelity; fidelity(harness, version, cell)
        ├── src/decider    what consumers import
        ├── src/opencode   server plugin entry (@opencode/plugin)
        ├── src/pi         extension entry
        ├── src/claude     mod entry, with a hook-command fallback
        └── src/hook       the hook command (Codex; Claude Code with mods off)
```

These are development and peer dependencies on each harness's plugin types (`@opencode/plugin`, Pi's extension types, the Claude mod types). They need approval under the project rules.

### Usage

**A consumer as a decider.** sourcefed delivers an event, and Workhorse guards tool calls:

```ts
import { Decider } from "@workhorse/harness/decider"
import { fidelity } from "@workhorse/harness/fidelity"

const sourcefed = await Decider.serve({ name: "sourcefed", priority: 50 })

sourcefed.on("session.created", (e) => sessions.track(e.session, e.harness, e.parent))

// A new PR comment arrives while the agent is idle.
const cell = fidelity(session.harness, session.version, "message.append.wake")
// { fidelity: "fallback", when: "turn-end", how: "Stop with decision: block" } on Codex

const result = await sourcefed.act(session.id, {
  action: "message.append",
  parts: [{ text: summary }],
  delivery: cell.when === "never-idle" ? "next" : "wake",
  late: "next",
  revision: session.revision,
})
// result.status: "delivered" | "queued" | "stale" | "unsupported"
```

```ts
const workhorse = await Decider.serve({ name: "workhorse", priority: 10 })

workhorse.before("tool.before", async (e) => {
  const verdict = await daemon.decide({ session: e.session, tool: e.tool, input: e.input })
  if (verdict.effect === "deny") return e.deny(verdict.reason)
  if (verdict.effect === "ask") return e.askUser(verdict.reason)
  return e.allow()
}, { budget: 1_500, onTimeout: "block" })

workhorse.on("response.finished", (e) => {
  if (e.reason === "aborted") daemon.cancelLeases(e.session)
})
```

**Install.** `@workhorse/agents` writes one adapter per harness. On Codex it emits:

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "workhorse-harness hook codex", "timeout": 3 }] }]
  }
}
```

It does the same for `SessionStart`, `UserPromptSubmit`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop` and `SessionEnd`. On OpenCode, Pi and Claude Code it registers the plugin, extension or mod. Trust (`/hooks` in Codex, the folder trust prompt in Claude Code) stays a manual step, as decision 7 requires.

**Chauffeur.** Its daemon registers as one decider and keeps fanning out to its own plugins inside. `chauffeur hook codex` is either replaced by `workhorse-harness hook codex`, or kept as a second implementation of the same `schema/` contract in Rust. It must then pass the same conformance suite.

### Proof

1. **Pure:** combining-rule tables, revision checks, and hostile input (oversized context, unknown events, wrong shapes) against the JSON Schemas.
2. **Shim conformance per harness, with no model calls:**
   - OpenCode: a server plugin test with `@opencode/sdk` in-process.
   - Pi: an SDK session.
   - Claude Code: `claude plugin test` for the mod.
   - Codex: the hook command fed recorded payloads.

   Each test runs a recorder decider and checks that every `native` cell does what it says.
3. **Real harness, nightly, with a capped budget (decision 10):**
   - A deny prevents the tool call: the recorder MCP server sees no call.
   - A `wake` starts a turn in an idle session where the cell says it can.
   - A decider timeout with `onTimeout: "block"` refuses the call on each harness.

   A failing cell is flipped to `unsupported` until it is reviewed.

---

## 9. Open questions

1. **Name and home.** `@workhorse/harness` in the `agents/` workspace (recommended), a neutral name such as `harnesswire`, or keep it inside Chauffeur?
2. **Who fans out.** A decider registry read by every adapter (recommended; no hub process), or Chauffeur's daemon as the single hub that other consumers register with?
3. **The hook command.** One shared binary (Rust from Chauffeur, or a compiled Bun executable), or one per consumer? One per consumer brings back racy rewrites on Codex.
4. **`session.resumed`.** Accept the split proposed in correction 17: `session.resumed` means reopened, and `prompt.sent.idle_seconds` covers the user returning.
5. **Codex live tier.** Is a spike worth it to test whether a second app-server client can steer a thread the TUI owns?
6. **Claude Code wake.** Is a spike worth it on posting to `CLAUDE_CODE_MESSAGING_SOCKET` from a non-child process, and on which `crossSessionInbound` value that needs? Asking users to set `accept` widens what can reach the session.
7. **Mods or hooks on Claude Code by default.** Mods give `now`, wake, compact, model and registries. Hooks keep working where organizations turn mods off. Should the installer register both, with the mod taking over when it loads?
8. **Rewrite on Codex.** Correction 16 means a rewrite also approves the call. Should rewrites on Codex require an explicit `allow` from every decider, or be refused?
9. **Model-request events.** Keep them out of the standard set until a second consumer needs them?
