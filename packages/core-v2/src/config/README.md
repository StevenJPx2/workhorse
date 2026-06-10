# Workhorse Config

The **config plane**: the declarative, authored-on-disk files that describe
workflow types, step presets, and global settings. This folder will hold the
Zod schemas that validate that config — it never executes anything.

> **Status.** The _shape_ described here is agreed. The Zod schemas are being
> rebuilt to match it and are **not yet implemented** — today this folder holds
> only this spec plus the shared enums in [`../schema`](../schema). For a gentle,
> file-by-file tour, read the worked example in
> [`plan/rearchitecture/config-walkthrough/`](../../../../plan/rearchitecture/config-walkthrough/);
> this document is the spec behind it.

- Runtime model (source of truth): [`rearchitecture.md`](../../../../plan/rearchitecture/rearchitecture.md)
- Shared enums (`Status`, condition names, operators, state keys): [`../schema`](../schema)

---

## The model on one screen

A **workflow** is a line of **stages**:

```
planning ──▶ implementing ──▶ ready_for_review ──▶ in_review ──▶ done
```

- A stage runs its **steps** in declaration order, looping back to the first,
  until a **rule** moves to another stage.
- A rule reads as **`when <expr>, to <stage>`**; first match wins. With no
  satisfiable rule a stage just keeps looping, or **parks** (waits for an
  external event) — that's normal for `in_review` and `blocked`.
- **Steps never route.** Only stages carry rules, and a rule only ever switches
  stages. A backward edge is just a `to` an earlier stage.

Two invariants shape every file:

- **Config references; it never defines.** Capabilities (agents/adapters, tools,
  skills, services) are registered in **code or plugins**. Config only _names_
  them — a step _selects_ a backend and _gates_ tools/services by name. The
  resolver checks those names against the live registry at load.
- **Settings cascade** `global → project → workflow type → preset → step` —
  later wins, most-specific wins.

---

## Where config lives

| File                               | Holds                             | Schema           |
| ---------------------------------- | --------------------------------- | ---------------- |
| `~/.config/workhorse/config.toml`  | personal defaults                 | `MainConfig`     |
| `.workhorse/config.toml`           | project defaults + preset patches | `MainConfig`     |
| `.workhorse/workflows/<name>.toml` | a workflow type                   | `WorkflowConfig` |
| `.workhorse/presets/<name>.toml`   | one reusable step body            | `PresetConfig`   |

`.workhorse/` is **read-only to agents**, and a workflow type is parsed and
**frozen once at workflow start** (no mid-run reload) — so a coding agent can't
rewrite the workflow that governs it.

---

## A workflow type

The file has two halves: the **stages** (the machine) on top, and a **step
library** (definitions referenced by id) below.

```toml
# .workhorse/workflows/ralph.toml
name = "ralph"
version = "1"

# ── stages: each runs its steps in order, looping, until a rule fires ──
[[states]]
name  = "planning"
steps = ["prompt-engineer", "planner"]
exits = [{ when = "todos_complete", to = "implementing" }]

[[states]]
name  = "implementing"
steps = ["coder", "memory-weaver"]          # loops coder → memory → coder …
exits = [{ when = "todos_complete", to = "ready_for_review" }]

[[states]]
name  = "ready_for_review"
steps = ["verifier"]
exits = [
  { when = 'checks_status == "passed"', to = "in_review" },
  { when = 'checks_status != "passed"', to = "implementing" },   # backward edge
]

[[states]]
name  = "in_review"
steps = ["reviewer"]
exits = [{ when = "open_review_threads > 0", to = "implementing" }]
# no other rule → parks until an external hook forces `done`

# ── step library: definitions only, referenced by id above ──
[steps.coder]
preset       = "coding"
token_budget = 150_000                       # override the preset for THIS workflow
  [[steps.coder.sub_agents]]
  name        = "researcher"
  write_globs = []
  tools       = ["fs_read", "fs_grep", "fs_glob"]

[steps.memory-weaver]
preset = "memory"
model  = "claude-haiku-3"
# prompt-engineer / planner / verifier / reviewer: just `preset = "…"`
```

Rules of the shape:

- A stage `name` is one of the fixed statuses (`Status` in
  [`../schema/status.ts`](../schema/status.ts)). `done` is the terminal target,
  not a declared stage — reaching it ends the run.
- A step lists **no `status`** — the stage that names it decides where it runs.
- `preset` pulls in a named bundle; any field set on the step overrides it. The
  table key (`[steps.coder]`) is the step's id and is the only required part.

---

## The `when` rule language

`when` is a small, **safe boolean expression** — pure data, never code. It mixes
three kinds of atom, combined with `and` / `or` / `not` and parentheses:

| You write                      | Kind                   | Means                       |
| ------------------------------ | ---------------------- | --------------------------- |
| `todos_complete`               | built-in name          | a fixed runtime check       |
| `git_clean`                    | bare boolean state key | `gitClean == true`          |
| `todo_count == 0`              | state comparison       | `==` `!=` `>` `>=` `<` `<=` |
| `checks_status != "passed"`    | …with a string         | string literal              |
| `file_exists("PLAN.md")`       | `exists`               | parameterised key           |
| `branch matches "^feat/"`      | `matches`              | pattern                     |
| `todos_complete and git_clean` | composite              | mix names + state freely    |

- Built-in **names**, **state keys**, and **operators** are fixed, core-owned
  sets (see [`../schema/condition.ts`](../schema/condition.ts)), so a bad name or
  operator is caught the moment the workflow loads.
- State keys are **runtime-extensible**: plugins surface extra keys
  (e.g. `checks_status`, `open_review_threads` for the review tail).
- There is no `state_check` atom — comparisons are written inline. There is no
  `resource_exceeded` — see [Resources](#resources).

---

## Presets

A preset is a **reusable step body** — prompts, tool/service allowlists,
budgets — minus its `id` and minus where it runs (the workflow's stage decides
that). One file per preset:

```toml
# .workhorse/presets/coding.toml
prologue = "You are a senior engineer. Implement the plan; keep diffs small and tested."
epilogue = "Summarise what changed and what is left."
tools    = ["fs_read", "fs_write", "fs_grep", "git_commit", "todo_list"]
services = ["git", "l2"]
```

The project `config.toml` can **patch** a preset repo-wide without touching the
preset file (see below).

---

## Global / project config — `config.toml`

```toml
# .workhorse/config.toml
[defaults]                          # cascade root: seeds every step
agent             = "claude"        # a name the runtime registered
model             = "claude-sonnet-4"
token_budget      = 100_000
tool_timeout      = 120_000         # ms
tool_output_limit = 3_000           # chars before tool output is truncated
retry             = 0               # 0 = fail-fast

[presets.coding]                    # "in THIS repo, the coder uses Codex"
agent = "codex"
```

- `[defaults]` seeds every step (the cascade root).
- `[presets.<name>]` patches a preset for this repo; explicit step fields still win.
- **No agent / tool / service definitions live here** — those are code/plugin
  concerns. `agent`, `tools`, and `services` are names the resolver validates
  against the live registry.

### Resources

Resource usage (memory / CPU / disk / network) is **monitored automatically by
the Harness** and surfaced as metrics/events. There is **nothing to configure
and no limits** — monitoring is a runtime behaviour, not an authoring surface.
(If a workflow ever needs to _react_ to usage, a monitored value can be exposed
as a state key and compared in a `when` rule — opt-in, and still not a limit.)

---

## On disk and in schema

Config is authored — and validated — in idiomatic **snake_case** throughout
(`token_budget`, `next_status`, `ready_for_review`). The Zod schemas mirror the
TOML shape directly; there is **no case conversion**. The loader just parses and
applies the cascade.

> The loader, cascade resolver, and `when` parser are **not built yet**. Until
> they exist, validate by hand-building the snake_case object directly.

---

## Validation

**In-schema (shape only):**

- a workflow has ≥ 1 stage; stage `name`s are valid statuses; step ids are unique;
- every id in a stage's `steps`/`exits` exists in the step library;
- every `to` names a stage in this workflow (or terminal `done`) and differs
  from the owning stage;
- every `when` parses, and every name / key / operator in it is known.

**Deferred to the loader / runtime (needs cascade or live registries):**

- preset-name existence and the cascade defaults;
- **reachability** — a non-parking stage needs a satisfiable exit; a park stage
  needs an external route;
- `agent` / `tools` / `services` names resolve against what code/plugins registered.

---

## Implementation status

- **Exists:** this spec; the shared enums in [`../schema`](../schema)
  (`Status`, `ConditionName`, `Operator`, `BuiltinStateKeys`).
- **To reconcile when the schemas are rebuilt:** `ConditionName` still lists
  `resource_exceeded` (retired with resource limits) and `state_check` (now
  folded into the `when` expression grammar) — both should be dropped.
- **Planned:** the Zod schemas in this folder; the loader + cascade resolver; the
  `when` expression parser; reachability validation.
