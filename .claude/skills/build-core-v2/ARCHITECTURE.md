# core-v2 Architecture Outline

A component-by-component outline of the canonical design. Source of truth: `plan/rearchitecture/rearchitecture.md` (section pointers below as `§`). This is an outline, not a copy — open the doc for full prose, diagrams, and TOML examples.

## Two planes — "config gates; it never provides"

- **Config plane** (authored, on disk, **snake_case throughout**): workflow types, step presets, **agent definitions**. Two roles: *providers* (an agent definition supplies tools/skills/scripts/models for a backend like `claude`/`pi`/`codex`) and *gates* (a Step's `tools[]`/`services[]` are allowlists only).
- **Runtime plane** (in memory): the live `Agent` — "bones" with no config.
- **Assembly is one-directional:** `(agent definition ∪ service contributions) ∩ step allowlist`, most-restrictive wins. `services[]` gates which services are active; `tools[]` is the final per-tool filter — a tool must pass both. The capability services declare/collect; the Harness intersects. → `§ Config Plane vs Runtime Plane`

Three related-but-distinct concepts:

- **`AdapterClass`** — runtime *implementation* of a backend; registered via `registerAdapter`; instantiated into a live `Agent`.
- **`Agent`** (runtime) — a live instance the Harness drives (`run`/`notify`/`interrupt`).
- **`AgentDefinition`** (config) — names an adapter class and supplies its capability set. A Step's `agent` field references it by name.

## Orchestrator & GlobalContext

Owns the full bootstrap lifecycle. Creates **GlobalContext** once, then a **WorkflowContext** per workflow run (no shared mutable state). → `§ Orchestrator`

- **GlobalContext**: infrastructure (`db`, `hooks`, `config`) + registries (service definitions, adapter classes, agent definitions, workflow types) — *definitions only, no instances*.
- **WorkflowContext**: per-run instances of services/agents, built from the registries; carries `status`, `issue`.
- **Issue intake** happens at the Orchestrator level before a Workflow starts: a lightweight one-off agent (via `AgentService`) fetches/structures issue details from any source → JSON `Issue` → DB record → worktree/branch → Workflow starts.

## Workflow, stages & exits

A Workflow is a line of **stages**, isolated to its worktree + `$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`. → `§ Workflow`

- **Status enum**: `planning → implementing → blocked → ready_for_review → in_review → done` (`schema/status.ts`).
- **A stage (`[[states]]`) is one status** with an ordered `steps` list (step ids) that run in declaration order and **loop back to the first** until an exit fires. Intra-stage flow is purely positional — a step never names "what runs next."
- **Only stages route, via `exits`.** Each exit is `{ when = "<expr>", to = "<status>", epilogue? = "<prompt>" }`, evaluated in order — **first match wins**. When a `when` holds, control switches to the `to` status and lands on that stage's first step. `to` must differ from the stage's own status and resolve to a known status (load-time check). A backward edge is just a `to` an earlier stage. An exit's optional `epilogue` is the transition handoff (see Step & presets).
- **Step library** (`[steps.<id>]`): definitions referenced by id from stages. A step carries **no status and no routing** — the stage that lists it decides where it runs.
- **Terminal & park states**: reaching `done` ends `Workflow.run()` (no "done step"; forced by an external hook). `blocked` (agent-set / retry-exhaustion / fail-fast, exited by external `status_changed`) and a signed-off `in_review` are **park states**.
- **Plugin-injected pre-transition steps** run synchronously, out-of-band, before a stage's own steps (e.g. GitHub PR-creation on entry to `in_review`).
- **Reusable tail** (`ready_for_review` verifier → `in_review` reviewer) is documented once and inherited by most workflow types.
- Workflow types are **pure data** (TOML), validated and **frozen once at start**. `ralph` ships built-in; custom types load from `.workhorse/workflows/`.

## The `when` rule language

A stage's exit `when` is a small, **safe boolean expression** — pure data, never code. Atoms combine with `and`/`or`/`not` + parentheses. → `§ The `when` Rule Language`

- **Built-in names** (fixed, core-owned): `todos_complete`, `token_budget_exceeded`, `step_idle`, `status_changed`, `review_settled`, `always`.
- **State keys** (runtime-extensible by plugins): `file_exists`, `git_clean`, `git_ahead`, `todo_count`, `token_used`, `iteration_count`, `status` (+ e.g. `checks_status`, `open_review_threads`). Used bare (truthy), in comparisons (`todo_count == 0`, `checks_status != "passed"`), or parameterised (`file_exists("PLAN.md")`, `branch matches "^feat/"`).

## Step & presets

A Step is "what to run" (the Harness is "how"). Fields: `id`, `preset?`, `prologue`/`epilogue`, `tools[]`/`services[]` (allowlists), `agent`, `model`, `token_budget`, `tool_timeout`, `retry` (default 0 = fail-fast), `sub_agents`. → `§ Workflow`, `§ Harness`

- **Fresh agent session per step** — context flows only through prologue (system prompt) → epilogue (the handoff prompt; its response feeds the next step's prologue). The **handoff is edge-scoped**: when a step resolves (completed *or* interrupted by a firing exit), routing is decided, then the chosen edge's handoff is sent — the source `Step.epilogue` when staying in the stage (advance/loop), or the firing `ExitRule.epilogue` (falling back to `Step.epilogue`) when leaving. An exit handoff can reflect the exit's reason (e.g. `token_budget_exceeded` → "checkpoint progress").
- **Presets** (`prompt`, `planning`, `coding`, `memory`, `verify`, `review-monitor`, …) are reusable step bodies; any step field overrides the preset.
- **Cascade**: `global → project → workflow type → preset → step` (later wins). Project config may patch a preset by name (`[presets.coding] agent = "codex"`).

## Harness

One **generic** engine that executes any step. → `§ Harness`

- Instantiates the runtime `Agent` from the agent definition named by `Step.agent`.
- Intersects providers against the step allowlist and provides the result.
- Enforces **tool output truncation** (configurable, ~2000–3000 chars; full output + range hint) and **per-tool timeouts** (`tool_timeout` + per-tool override).
- **Boundary interrupts only** — finishes the in-flight tool call, then halts; never mid-tool-call (no partial writes/commits).
- Coordinates sub-agents (spawn, `ask_parent` routing, one-level-deep); monitors resources, emits metrics (observability, not routing).

## Agent & the Event Stream

`Agent.run(prompt, tools, options) → AsyncIterable<AgentEvent>`; plus `notify(message)` and `interrupt()`. → `§ Agent Event Stream`

- **Events**: `tool_call`, `tool_result`, `message`, `token_usage` (→ `token_budget_exceeded`), `idle` (→ `step_idle`), `done` (`{ reason: completed | interrupted | error }`), `error`.
- **Termination contract**: the iterable *always* ends with a `done` event. `interrupt()` finishes the in-flight call, emits `done{ interrupted }`, closes.

## Sub-agents

Step config defines named templates (`tools`, `write_globs`, `agent`/`model` ceiling). → `§ Sub-Agents`

- Parent can narrow `write_globs` at spawn time but never exceed the ceiling. **One level deep** (sub-agents cannot spawn sub-agents).
- **`ask_parent(question)`** pauses the sub-agent, routes to the parent via `notify()`, returns the answer. Bound by the tool-timeout contract → no deadlock; a failing sub-agent surfaces as an error `tool_result`.

## Services

"Like an MCP, but **not bound to the Harness**" — a service can be used standalone, even in a different process. This is what lets **Moby** compose e.g. `AgentService` + `ToolService` to drive a single agent with chosen tools, without the whole product. Lifecycle `setup()`/`teardown()`. **Co-owned activation**: service declares (tagged) contributions, the step allowlist filters, the Harness intersects. → `§ Service`

- **`ToolService` / `SkillService` / `ScriptService`** — the capability registries where services and plugins register tools, skills, and scripts; the Harness gates them per step.
- **`GitService`** (`git_add`/`commit`/`push`/`pull`), **`L1Service`** (per-worktree `context.md` memory + periodic compaction), **`L2Service`** (semantic search via `retriv`: BM25 + vectors; contributes a prompt section), **`AgentService`** (`spawn_subagent`; also drives standalone intake/Moby), **`ASTService`** (rename/extract).

> ⚠️ The contribution API (hooks) and some base-service specifics are **still being defined** (the `ToolService`/`SkillService`/`ScriptService` split is a fresh decision). Confirm against the Service section of `rearchitecture.md` before relying on details.

## Plugins vs Services

- **Services** are the core capability providers, but **not harness-bound** (reusable standalone). Within a workflow the Harness collects their contributions and filters them per step.
- **Plugins** are fully external — they contribute through the same capability services at setup time (globally) and may inject pre-transition steps. The core never depends on a plugin. → `§ Plugins`

## Directory layout & state

- **`.workhorse/`** (in worktree, committed): project config, custom skills, custom workflow types — **read-only to agents via FS tools** (prevents self-tampering; combined with freeze-at-start).
- **`$XDG_STATE_HOME/workhorse/workflow/<issue-id>/`** (runtime state): todos, memory, step outputs — **tool-access only**, shared across runs for the same issue.

## Error handling & recovery

- **Fail-fast to `blocked`** by default (`retry = 0`); on exhaustion sets `status = blocked` with the error captured. → `§ Error Handling & Recovery`
- **Status-granularity resume**: only the current `status` is persisted; on restart, re-enter that stage at its first step (mid-step work is never resumed — persisted memory/todos/L1 carry the real work).

## Database

Minimal: keep `issues`, `notifications`, `events` in SQLite; add a `workflow_runs` table (`issue_id`, `workflow_type`, `status`, `started_at`, `completed_at`). All other runtime state lives as files in XDG state.
