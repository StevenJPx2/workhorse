# Config Schema — Scope & Decisions

Decision record for the Zod schemas that model the **Workhorse config plane**
(`packages/core-v2/src/{schema,config}/`). Written before implementation per
request. This captures the resolved decisions, the exact scope, every field
that was **inferred** (vs. taken verbatim from the doc), and discrepancies in
the source material that the schema has to take a position on.

Source of truth: `plan/rearchitecture/rearchitecture.md` (+ `learnings.md`).

---

## Resolved decisions (interview)

1. **Shape = camelCase _normalized_.** The schemas validate the in-code shape,
   not the raw on-disk TOML. On disk authors write idiomatic **snake_case**
   (`token_budget`, `next_status`, `sub_agents`); a config **loader** maps
   snake_case → camelCase _before_ these schemas run. This matches the existing
   `schema/status.ts` (`readyForReview`, `inReview`).
   - **Corollary — enum _values_ are normalized too.** `status.ts` normalizes
     not just keys but enum _values_ (`ready_for_review` → `readyForReview`).
     For consistency we apply the same to condition names and built-in state
     keys: `todos_complete` → `todosComplete`, `state_check` → `stateCheck`,
     `git_clean` → `gitClean`, etc. If the loader is later decided to normalize
     keys only (not values), this is the one place to revisit — it is
     centralized in `schema/condition.ts`.

2. **`stateCheck.key` = open string, extendable.** The authored schema accepts
   any non-empty string. We also export `BUILTIN_STATE_KEYS` (advisory) and a
   `makeStateKey(extraKeys)` factory that returns a **strict enum** for runtime
   validation (so plugins can register additional keys like `checksStatus`,
   `openReviewThreads`). Condition _names_ and operators remain **closed enums**
   (the doc is firm that conditions are a fixed built-in set).

3. **Scope = full config plane, conservative inference.** Model everything the
   doc specifies; for the under-specified global `workhorse.toml`, infer only
   sensible fields grounded in prose and mark each `[inferred]`.

---

## Scope

**In scope (config plane only):**

| Entity              | File                   | Source                                |
| ------------------- | ---------------------- | ------------------------------------- |
| `Status` enum       | `schema/status.ts`     | doc (+ `blocked` fix, see below)      |
| Condition names     | `schema/condition.ts`  | doc                                   |
| Operators           | `schema/condition.ts`  | doc                                   |
| State keys (+factory)| `schema/condition.ts` | doc + decision #2                     |
| `ResourceLimits`    | `config/resources.ts`  | doc (`[steps.resources]`)             |
| `Condition` (composite) + `Transition` | `config/transition.ts` | doc        |
| `SubAgentTemplate`  | `config/subagent.ts`   | doc                                   |
| `AgentDefinition` + capability defs | `config/agent.ts` | doc (+ inferred `adapter`)   |
| `StepConfig`        | `config/step.ts`       | doc (authored = mostly optional)      |
| `PresetConfig` / `PresetMap` | `config/preset.ts` | doc (derived from `StepConfig`) |
| `WorkflowConfig`    | `config/workflow.ts`   | doc + load-time refinements           |
| `MainConfig` / `StepDefaults` | `config/main.ts` | mostly `[inferred]`             |

**Out of scope (deliberately):**

- The **runtime plane** — `Agent` (`run`/`notify`/`interrupt`), `AgentEvent`,
  `AdapterClass`, `Harness`, `Workflow`/`Step` runtime classes. These are
  behavioral, not config.
- The **snake_case → camelCase loader** and TOML/JSON parsing itself.
- **Resolved/effective** step validation (a fully-populated step after the
  cascade). These schemas validate **authored** config; resolution defaults
  (e.g. `retry = 0`) are applied by the loader, not here. Noted as a follow-up.
- Wiring the package entry (`src/index.ts`) to re-export schemas — left as a
  follow-up to avoid changing package behavior.

---

## Normalization principle

> **Config gates; the loader normalizes.** Authors write snake_case TOML →
> loader normalizes keys (and enum values) to camelCase → **these Zod schemas
> validate** the normalized object → resolver applies the
> `global → project → workflowType → preset → step` cascade and defaults.

These schemas sit at the validation step. They are intentionally **permissive
about presence** (authored steps are mostly optional because presets + cascade
fill gaps) and **strict about typos** (`.strict()` on well-specified objects).

---

## Inferred fields (not verbatim in the doc)

Everything below is `[inferred]` and tagged in code so it is easy to revisit:

- **`AgentDefinition.adapter`** — the struct (rearchitecture.md §Config plane)
  lists only `name/tools/skills/models/scripts`, but the prose says an agent
  definition "names an adapter class" (claude/pi/codex) that the Harness
  resolves. Modeled as an optional adapter-name string.
- **Capability defs** (`ToolDef`/`SkillDef`/`ScriptDef`/`ModelDef`) — the doc
  types these as `Tool[]/Skill[]/Model[]/Script[]` but never specifies their
  shape (it's a runtime contract). Modeled as **loose** objects requiring only
  `name` and preserving unknown keys (`.catchall(unknown)`). Tighten later.
- **`MainConfig`** (global/project `workhorse.toml`) — the doc only sketches
  preset patches (`[presets.coding]`) and resource/limit defaults. Inferred:
  - `defaults` (`StepDefaults`): `agent`, `model`, `toolTimeout`, `tokenBudget`,
    `toolOutputLimit` (the "tool output truncation, default ~2000–3000 chars"),
    `retry`, `resources`.
  - `presets`: `Record<name, PresetConfig>`.
  - `agents`: `AgentDefinition[]` (config-plane providers).
  - Kept **non-strict** (permissive) so the global config can grow.
- **`ResourceLimits.maxNetworkMb`** — doc lists network as a monitored resource
  but only gives `max_memory_mb`/`max_cpu_pct`/`max_disk_mb` in the example.

---

## Flagged discrepancies in the source doc

1. **`blocked` missing from `schema/status.ts`.** The doc's `Status` enum
   (rearchitecture.md §Structs) and the entire error/park-state model include
   `blocked` (agent-set entry, retry-exhaustion, fail-fast; exited by external
   `status_changed`). The existing `status.ts` omits it. A config schema that
   can't represent `next_status = "blocked"` can't validate the documented
   flows. **Decision: add `blocked`** to `status.ts`, in doc order
   (`planning, implementing, blocked, readyForReview, inReview, done`). This is
   a one-line, reversible change — flagged here for visibility.

2. **State keys beyond the documented 7.** The "known keys" list is
   `file_exists, git_clean, git_ahead, todo_count, token_used, iteration_count,
   status`, but the reusable-tail example uses `checks_status` and
   `open_review_threads`. Resolved by decision #2 (open string + extendable
   strict factory).

3. **`stateCheck` inside a composite.** `stateCheck` needs sibling `key/op/value`
   on the transition, but composite members (`all.of` / `any.of`) are bare
   condition names. So a `stateCheck` can't currently be nested in a composite.
   The schema validates `key/op` presence only for a **top-level** `stateCheck`
   condition. Noted; not over-engineered.

4. **`version` casing.** Example uses `version = "1"` (string). Schema requires a
   string; numeric `version = 1` in TOML must be stringified by the loader.

5. **`subAgentTemplates` vs `sub_agents`.** The struct field is
   `subAgentTemplates`; the TOML key is `[[steps.sub_agents]]`. The authored
   (normalized) key is `subAgents` — that is what the schema uses.

6. **Composite members: condition names only (doc example uses a state key).**
   The prose (§AND/OR composites) says `all`/`any` take "a list of condition
   names or further nested composites", but the example
   `of = ["todos_complete", "git_clean"]` uses `git_clean` — a **state-check
   key**, not a built-in condition. The schema follows the **prose**: composite
   members are condition names or nested composites, so a bare state key like
   `gitClean` will NOT validate. **Consequence:** "todos complete AND git clean"
   is currently inexpressible as a composite (state predicates live as sibling
   `key/op/value` on a single transition, not inside `all`/`any`).
   **Open decision (needs your call):**
   - (a) keep prose-faithful (current) and fix the doc example; or
   - (b) allow inline state-check objects as members
     (`{ condition: "stateCheck", key, op, value }`) — expressive, unambiguous; or
   - (c) allow bare state keys as truthy members (makes the doc example parse,
     but any unknown string becomes a state key given the open-key decision).

   Recommendation: **(b)**.

---

## Validation: in-schema vs. deferred to loader

**Enforced in-schema:**

- Step `id` non-empty; unique within a workflow (`WorkflowConfig` superRefine).
- `condition` is a known built-in (or AND/OR composite of known built-ins).
- `nextStatus` ∈ `Status`.
- `nextStatus` ≠ the step's own `status` — **only when the step's `status` is
  explicitly authored** (it may otherwise be inherited from a preset and is
  unknown at this raw layer).
- A top-level `stateCheck` transition requires `key` and `op`.
- `stateCheck.op` ∈ the operator set.
- `.strict()` typo-catching on well-specified objects.

**Deferred to the loader/resolver (needs cascade or cross-file context):**

- **Park-block reachability** — "a block with no internal exit must have an
  external route." Needs the fully-resolved status graph.
- **`nextStatus` resolves to a real block** (or terminal `done`). Needs resolved
  statuses across all steps.
- **Preset-name existence** (a step's `preset` references a defined preset).
- **Field defaults** (`retry = 0`, truncation limit, timeouts) and the cascade.

---

## Conventions

- One file per concept (the doc's "smaller, more focused, more maintainable").
- Naming follows `status.ts`: schema const = PascalCase noun; inferred type =
  `<Name>T` (e.g. `StepConfig` / `StepConfigT`). Config-plane schemas use a
  `…Config`/`…Definition` suffix to avoid clashing with future runtime classes
  (`StepConfig` vs a runtime `Step`).
- Import style mirrors `status.ts`: `import z from "zod"`.

---

## Follow-ups (not in this change)

- Resolved/effective `Step` schema (fully-required, post-cascade).
- The snake_case→camelCase loader + TOML parsing + the cascade resolver.
- Park-block reachability + cross-step `nextStatus` resolution validation.
- Tighten capability defs (`ToolDef` etc.) once runtime contracts are specified.
- Re-export schemas from `src/index.ts` for the SDK surface.
