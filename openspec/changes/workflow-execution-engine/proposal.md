## Why

`orchestrator-boilerplate` deliberately shipped `Workflow.run`, `Harness.run`, and `Agent.run` as TODO stubs. `Workflow.run` is a flat double-loop that never reads `state.exits`, never evaluates a `when` rule, never calls `updateStatus`, and never loops — it is a placeholder, not the stage machine described in `plan/rearchitecture/rearchitecture.md`. `Harness.run` already reaches for `new Agent(...)` against an interface-only `agent.ts`, leaving the working tree **red** (`tsc` fails on a type-used-as-value and on private harness fields the tests read).

This change turns the scaffold into a working runtime: a real stage machine, an `Agent` the harness can actually drive, and a green build. The goal is to **complete the outline of how the full implementation works** while landing a first pass that is intentionally minimal where the full grammar is large.

## What Changes

- **Workflow.run becomes a stage machine.** Declaration-order stepping, implicit loop-back to the first step, exit evaluation (first match wins), `updateStatus` transitions that land on the target stage's first step, terminal `done`, **park** states, and edge-scoped epilogue→prologue handoff.
- **Add a Router + `when`-evaluator.** A safe boolean-expression evaluator over built-in names, state keys, and comparisons, fed by a pluggable `StateProvider`. Pass 1 ships a minimal subset (built-in names + bare boolean keys + `and`/`or`/`not`); the full grammar (comparisons, `matches`, `file_exists(...)`) is designed here and landed additively.
- **Build a runtime `Step`.** Resolve `preset`, merge step overrides, expose camelCase fields (`tokenBudget`, `toolTimeout`, `subAgents`). `Workflow.steps` becomes a runtime `Step` map; `State.steps` stays a list of ids.
- **Implement `Agent` as bones (engine + pluggable source).** Keep the `Agent` interface; add one concrete `AgentRuntime` engine that owns the event-stream contract (async queue, **guaranteed single terminal `done`**, boundary-only `interrupt`, `notify` injection) and consumes a pluggable event **source**. Ship a `scriptedSource` test util in core-v2; the real **Pi** source (`@earendil-works/pi-coding-agent`) is the reference backend — validated in the design, authored in a plugin (`workhorse-plugin-pi-adapter`), **not** in core-v2.
- **Wire the Harness to bones.** Resolve `Step.agent` → `AgentDefinition` → `AdapterClass` → instantiate `Agent` (or an injected factory in tests); assemble the gated capability set; drive `agent.run(prompt, tools, options)`; enforce boundary halts, tool timeouts, and output truncation; perform the handoff turn.
- **BREAKING (internal):** `Harness.globalContext` / `workflowContext` / `step` become `public readonly` (tests already read them); `Agent` is imported type-only where used as a type. This restores a green `tsc`.

## Capabilities

### New Capabilities

- `when-rule-evaluator`: a safe boolean-expression grammar (names + state keys + comparisons, combined with `and`/`or`/`not`) plus the `StateProvider` contract that supplies the keys, and load-time validation of every `when`.
- `agent-runtime`: the `AgentRuntime` event-stream engine (push→pull queue, always-terminate-with-`done`, boundary `interrupt`, `notify` injection) consuming a pluggable event **source**, plus a `scriptedSource` test util. The `Agent` contract is backend-agnostic and validated against the real Pi SDK (`@earendil-works/pi-coding-agent`); concrete adapters live in plugins.

### Modified Capabilities

- `workflow`: `run()` gains real stage-machine behavior — looping, exit-driven transitions, parking, terminal `done`, and handoff (was a stub).
- `harness`: `run()` drives a live `Agent`, assembles capabilities, enforces boundaries/timeouts/truncation, and performs the epilogue handoff (was a stub).
- `workflow-step`: a runtime `Step` is built from config with `preset` resolution and camelCase fields (the boilerplate left this as a thin wrapper).

> The `workflow` / `harness` / `workflow-step` capabilities are defined in the not-yet-archived `orchestrator-boilerplate` change; this change supersedes their stub-level requirements.

## Impact

- `packages/core-v2/src/workflow/**` — `workflow.ts`, `state.ts`, `step/`, `harness/agent.ts`, `harness/harness.ts`, plus a new `when`-evaluator module and a `StateProvider`/`Router` seam.
- No config-schema changes; consumes existing `StepConfig` / `StateConfig` / `WorkflowConfig` / `Status`.
- Restores a green `typecheck` and `test`; the minimal pass-1 `when` keeps the coverage gates (97% line/function, 95% branch) satisfiable without a full grammar.
- No public entry-point export changes; internal `#workflow` consumers only.
