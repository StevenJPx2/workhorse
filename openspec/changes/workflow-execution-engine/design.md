## Context

`orchestrator-boilerplate` produced a compiling skeleton (`Orchestrator`, `Workflow`, `Harness`, `Agent` interface, `State`/`ExitRule`, runtime `Step` wrapper). The bodies are stubs. The working tree currently diverges from that green scaffold: someone began wiring `Harness → new Agent(...)` and made the harness fields private, which breaks both the tests and the `Agent`-is-an-interface contract. `tsc` is red:

```
harness.ts(5)   'Agent' is a type, must be a type-only import (verbatimModuleSyntax)
harness.ts(16)  'Agent' only refers to a type, but is used as a value here   ← new Agent(...)
harness.test.ts(39-41)  globalContext / workflowContext / step are private
```

The canonical behavior is fully specified in `plan/rearchitecture/rearchitecture.md` (§Workflow, §Harness, §Agent, the `when` rule language, and the struct pseudo-code). This design translates that into a concrete, layered, testable runtime — and stages the build so pass 1 is small and green while the **complete mechanism is outlined here**.

Naming reminder: config is snake_case Zod (`token_budget`, `sub_agents`); runtime classes are camelCase. **Config gates; it never provides.**

## Goals / Non-Goals

**Goals:**
- A real `Workflow.run` stage machine: loop, exits (first match wins), `updateStatus` transitions landing on the target stage's first step, terminal `done`, park states, edge-scoped handoff.
- A clean three-layer execution seam — **Workflow** (routing) / **Harness** (session mechanics) / **Agent** (bones) — each independently unit-testable.
- An `AgentRuntime` engine that makes the event-stream contract correct (single terminal `done`, boundary-only interrupt, `notify` injection), consuming a pluggable event **source** (a `scriptedSource` for tests; Pi as the reference backend).
- A complete design of the `when` grammar, the `StateProvider`, capability assembly, and the handoff lifecycle — even where pass 1 ships only a subset.
- Restore a green `tsc` / test run.

**Non-Goals:**
- No real agent backend wired **into core-v2**. The concrete Pi/Claude/Codex adapters are plugin sources (e.g. `workhorse-plugin-pi-adapter`) and their own change; core-v2 ships the `Agent` contract, the `AgentRuntime` engine, and a `scriptedSource` test util — validated against Pi's real surface (Decision #7).
- No sub-agent spawning / `ask_parent` routing, no plugin-injected pre-transition steps, no resource monitors — designed-around, not built.
- No issue intake, worktree creation, or DB persistence.
- Pass 1 does not implement the full `when` grammar (comparisons / `matches` / `file_exists(...)`); it implements the AST + a subset and defers the rest additively.

## Decisions

### 1. Green-up: `Agent` stays an interface; one `AgentRuntime` engine + a scripted source; harness fields go public

- **Decision:** Keep `export interface Agent`. Add one concrete `export class AgentRuntime implements Agent` (the event-stream engine, Decision #7) that consumes a pluggable `source`, plus a `scriptedSource` test util. The harness imports `Agent` **type-only** and receives a live agent from a factory (default: resolve an adapter source via registries; tests inject `AgentRuntime` + `scriptedSource`). `Harness.globalContext` / `workflowContext` / `step` become `public readonly`.
- **Rationale:** Resolves all five `tsc` errors without a throwaway hotfix, and matches the spec ("a concrete agent authored against the `Agent` interface compiles" + "both contexts accessible on the instance"). The harness never does `new Agent(...)` — `Agent` is a contract; `AgentRuntime` is the implementation and backends are sources.
- **Alternative considered:** (a) make `Agent` a concrete class the harness `new`s directly — collapses the `adapterClasses` / `agentDefinitions` / `Step.agent` registry; (b) a `BaseAgent` → `ScriptedAgent` inheritance pair — an abstract base with a single subclass (speculative generality). Both rejected for composition: the invariant engine is one tested unit and backends plug in as sources (Decision #7).

### 2. Three-layer execution seam

Each layer owns one concern and is testable in isolation:

```
┌─ Workflow ───────────────────────────────────────────────┐
│  owns the stage machine + routing                        │
│  • cursor (current State, stepIndex)                     │
│  • Router.evaluate(state, observation) → ExitRule | null │
│  • transitions, loop-back, parking, terminal done        │
│  • seeds next prologue from the handoff response         │
│                                                          │
│   passes (step, prologue, router) ──────────┐            │
│                                              ▼            │
│  ┌─ Harness ─────────────────────────────────────────┐  │
│  │  owns ONE step's agent session                    │  │
│  │  • resolve adapter, assemble gated capabilities   │  │
│  │  • drive agent.run(prompt, tools, options)        │  │
│  │  • tool timeouts + output truncation              │  │
│  │  • consult router at boundaries; halt at boundary │  │
│  │  • inject epilogue, capture handoff, close        │  │
│  │                                                   │  │
│  │   agent.run / notify / interrupt ───────┐         │  │
│  │                                          ▼         │  │
│  │  ┌─ Agent (bones) ───────────────────────────┐    │  │
│  │  │  AgentRuntime: event-stream engine       │    │  │
│  │  │  + pluggable source (scripted | Pi | …)  │    │  │
│  │  │  run(prompt, tools, options) → events      │    │  │
│  │  └────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

- **Rationale:** The when-grammar lives only in the Workflow/Router (pure, fake-state tests). Session mechanics live only in the Harness (tested with a scripted source). The event-stream invariants live only in `AgentRuntime` (tested standalone, source-agnostic). This is the "tighter test coupling" goal of the rearchitecture.

### 3. The run loop (the heart)

A `cursor` is `(currentState, stepIndex)`. The loop:

```
init: currentState = states[0]; updateStatus(currentState.name); stepIndex = 0
      prologue = step(stepIndex).prologue            // first step's own prologue seeds it

loop forever:
  step    = steps[ currentState.stepIds[stepIndex] ]
  result  = await harness.run(step, prologue, router)   // see Harness; consults router at boundaries

  match result:
    ── exit(rule, handoff) ─────────────────────────────  // a `when` fired mid-run or at idle
        if rule.to == "done":  updateStatus("done"); return
        updateStatus(rule.to)
        currentState = stateByStatus(rule.to)
        stepIndex    = 0                                  // land on the target stage's FIRST step
        prologue     = handoff                            // agent's response to the edge epilogue

    ── idle(observation) ───────────────────────────────  // agent finished its turn, no exit matched
        if currentState.routing == "park":
            await currentState.untilExternalChange()      // hook-driven wake (status_changed / done / …)
            continue                                       // re-evaluate; a hook-fed exit may now match
        // working loop: advance in declaration order, looping back to 0
        handoff   = result.handoff                         // step.epilogue response
        stepIndex = (stepIndex + 1) % currentState.stepIds.length
        prologue  = handoff

    ── error(err) ──────────────────────────────────────
        route to `blocked` if the workflow defines it; else rethrow (designed; see §park/blocked)
```

- **Land on first step.** A transition always resets `stepIndex = 0` for the target stage — "switch block, land on its first step."
- **Loop-back is implicit.** No exit ⇒ advance modulo length ⇒ the stage re-runs its steps. Memory-weaver feeding the coder is exactly this.
- **Terminal `done` ends `run()`.** There is no "done step"; the status is a final side-effect.

### 4. Routing: poll-driven vs hook-driven exits, and parking

A stage's `exits` are evaluated against a `StateProvider`. There are two firing paths:

| Path | Keys | Evaluated | Effect |
| --- | --- | --- | --- |
| **Poll-driven** | `token_used`, `todo_count`, `git_clean`, `step_idle`, `iteration_count`, `todos_complete`, `token_budget_exceeded` | repeatedly *while the step runs* (the harness consults the router at each tool-call boundary + on idle) | a match halts the agent at the next boundary → `exit` |
| **Hook-driven** | `status_changed`, `review_settled`, `open_review_threads`, `checks_status`, forced `done` | fed by plugin/Jira/GitHub hooks into the `StateProvider`; wake a parked stage or re-trigger evaluation | transition on wake |

**Park** is a load-time classification: a stage whose `exits` contain **no poll-driven rule that could ever match on its own** (only hook-driven, or empty) is a park stage. `blocked` (no internal exits) and a signed-off `in_review` are the canonical parks. On idle with no match, a park stage closes the session and awaits a hook; a working stage loops its steps.

`StateProvider` contract (the seam between routing and the world):

```ts
interface StateProvider {
  check(name: BuiltinName): boolean;                 // todos_complete, step_idle, always, …
  key(name: string, args?: string[]): KeyValue;      // git_clean, todo_count, file_exists("PLAN.md"), …
  observe(o: StepObservation): void;                  // harness feeds live run state (tokens, idle, iteration)
  onChange(listener: () => void): () => void;         // hook-fed wake for parked stages
}
```

- **Rationale:** Keeps the evaluator pure and the "where do values come from" pluggable. Core ships the built-in keys; plugins extend `key`/hooks. Pass 1 wires the in-process keys (`step_idle`, `token_used`, `iteration_count`, `always`) and stubs the external ones to `false`/`undefined`.

### 5. The `when` rule language — full grammar designed, subset shipped

Parse once at load into an AST; evaluate against the `StateProvider`:

```
Expr   := Or
Or     := And ('or' And)*
And    := Unary ('and' Unary)*
Unary  := 'not' Unary | Primary
Primary:= '(' Expr ')' | Comparison | Match | Call | Name | Key | Literal
Comparison := Key Op (Number | String | Key)        Op := == != > >= < <=
Match      := Key 'matches' String
Call       := Ident '(' String (',' String)* ')'    // e.g. file_exists("PLAN.md")
Name       := one of the fixed built-in names         // todos_complete, always, …
Key        := identifier resolved via StateProvider.key
Literal    := Number | String | Name
```

- **Pass 1 ships:** `Name`, bare boolean `Key`, and `and`/`or`/`not` + parens. Enough for `ralph`'s `todos_complete → implementing`.
- **Pass 2 (additive):** `Comparison`, `Match`, `Call`. The AST node types exist from pass 1; pass 2 only adds evaluator arms + parser rules. No re-architecture.
- **Load-time validation** (rejects a workflow before it runs): every `when` parses; every built-in name / key / operator is known; every exit `to` resolves to a known `Status` (or `done`) and **differs from the owning stage's name**; an exit's optional `epilogue` is a non-empty string when present; **park-stage check** — a stage with no satisfiable exit is allowed only if it has an external route. This lives next to `buildState`.

### 6. Runtime `Step` build (preset resolution)

`State.stepIds: string[]` (per the spec). `Workflow.steps: Map<string, Step>`. `buildStep(id, config, presets)`:

1. If `config.preset`, start from `presets[preset]`; else start empty.
2. Shallow-merge step fields over the preset (step overrides win).
3. Map snake_case → camelCase: `token_budget → tokenBudget`, `tool_timeout → toolTimeout`, `sub_agents → subAgents`, etc.
4. Fall back to config/global defaults for `tokenBudget` / `toolTimeout` / `retry`.

- **Rationale:** Matches Decision #2 of the boilerplate design (runtime `Step` mirrors `StepConfig` as camelCase) and keeps snake_case out of runtime APIs. The harness/agent consume `Step`, never `StepConfigT`.

### 7. Agent runtime — engine + pluggable source (Pi as the reference backend)

The hard part of "implement `agent.ts`" is turning a push-based backend into a pull-based `AsyncIterable<AgentEvent>` with guarantees. A single concrete `AgentRuntime` (implements `Agent`) owns a bounded async queue + a single waiter (push→pull bridge); backends plug in as a **source** that produces raw events and receives `notify`/`interrupt` signals — composition, not inheritance:

```
backend → emit(event) ──► [ queue ] ──► run() async iterator pulls ──► consumer (Harness)
                                   ▲
                          notify(msg) enqueues an inbound turn (delivered at next boundary)
                          interrupt() sets a flag (drained at next boundary)
```

Invariants (each becomes a test):
- **Exactly one terminal `done`, always last.** A `finally` in the engine enqueues `done{completed}` normally, `done{error}` on throw, `done{interrupted}` if the interrupt flag is set. No events follow `done`.
- **Boundary-only interrupt.** `interrupt()` never tears down mid `tool_call`; the in-flight tool's `tool_result` is allowed to flow, then `done{interrupted}`.
- **`notify` injects at a boundary.** Queued inbound messages (out-of-band notifications, the handoff epilogue) are delivered to the backend between tool calls, never mid-call.

How a source plugs in: `source(prompt, tools, options, { emit, signals })` — it `emit`s events and reads `signals.takeInbound()` (notify messages) + `signals.interrupted()` at each boundary. Two sources matter:
- **`scriptedSource(events)`** — walks a fixed `AgentEvent[]` (+ optional `respondTo(notify)`), honoring `signals`. Lives in core-v2 as a test util; makes Harness/Workflow tests deterministic.
- **Pi (reference, in a plugin)** — wraps `@earendil-works/pi-coding-agent` (`createAgentSession` → `session.subscribe`/`prompt`/`steer`/`dispose`). The adapter lives in `workhorse-plugin-pi-adapter` (Decision #11), not core-v2.

Pi grounds the contract in a real backend (`SessionManager.inMemory()` gives the fresh-session-per-step the spec wants):

| `AgentEvent` / op | Pi reality | Owner |
| --- | --- | --- |
| `message` | `message_update` / `text_delta` | source forwards |
| `tool_call` | `tool_execution_start` | source forwards |
| `tool_result` | `tool_execution_end` | source forwards |
| `token_usage` | session usage (↑in ↓out, cache) | forward + normalize |
| `idle` | `agent_end` (turn boundary) | source forwards |
| `done{reason}` | — (no single done w/ a reason) | **engine synthesizes** |
| `error` | error event / rejected `prompt()` | forward → `done{error}` |
| `notify(msg)` | `session.steer()` (streaming) else `prompt()`; Pi delivers steering *"after the current turn finishes its tool calls"* | native boundary delivery |
| `interrupt()` | abort → `done{interrupted}`; `dispose()` = teardown | engine drives, source executes |

The gaps are the point: they pin exactly what the **engine** owns (the `done` reason taxonomy, usage normalization) versus what a **source** merely forwards — and Pi's native steering/abort show the boundary semantics aren't invented, they're how a real harness already behaves.

### 8. Harness capability assembly — designed, staged

The spec's assembly is `(agentDefinition ∪ serviceContributions) ∩ step.tools/services`, most-restrictive wins, then `tools[]` is the final per-tool filter. The Harness performs this at run time and provides the result to the agent (config only gates).

- **Pass 1:** pass `step.tools` through as the tool allowlist (gate only, no providers yet) so `agent.run(prompt, tools, options)` receives a concrete list. `services[]` recorded but inert.
- **Deferred:** the full union/intersection once `ServiceDefinition` contributions and `AgentDefinition` capability sets are real.

Run-time mechanics the Harness owns regardless: per-tool timeout (`Step.toolTimeout`, overridable), output truncation (~2–3k chars with a range hint), and the boundary halt.

### 9. Handoff (epilogue) lifecycle — edge-scoped

Every step ends by sending an epilogue **into the still-live session** and capturing the response, which becomes the next step's prologue. Which epilogue depends on the edge:

```
stay in stage (advance/loop) → step.epilogue
leave stage (exit fired)      → exit.epilogue ?? step.epilogue
```

Mechanics: at the chosen boundary, the Harness calls `agent.notify(epilogue)`, collects the resulting `message` events until `idle`, then `agent.interrupt()` to close, and returns the concatenated assistant text as `handoff`. This is why the handoff is extracted in the finishing agent's live session (it still holds the working context) and why `notify` must be boundary-safe (Decision #7).

### 10. `Harness.run` signature

`step` stays a constructor arg (the Workflow already builds a fresh `Harness` per step). `run` gains the per-run inputs: `run(prologue: string, router: Router): Promise<StepResult>`, where `StepResult = { kind: "exit"; rule; handoff } | { kind: "idle"; handoff; observation } | { kind: "error"; error }`. This updates the boilerplate's `run()`-takes-nothing stub test (expected — `harness` is a Modified Capability).

### 11. Backend boundary: adapters live in plugins; the agent is a worker, not a router

- **Decision:** Core-v2 owns the `Agent` interface, the `AgentRuntime` engine, the `AgentEvent` union, and the `scriptedSource` test util — nothing backend-specific. Concrete adapters (Pi, Claude, Codex) are **plugin** sources registered via `Orchestrator.registerAdapter`, exactly as v1 structured `workhorse-plugin-pi-adapter`. The agent backend has **no knowledge of workflow status or routing**; every routing signal (`todos_complete`, `git_clean`, `token_used`, …) is sourced by the Workflow's `StateProvider` from disk/git/tools/hooks (Decision #4).
- **Rationale:** Keeps core-v2 free of any model-SDK dependency and matches the `plugin` capability from `orchestrator-boilerplate`. Pi's own philosophy proves the boundary: it ships **no built-in todos, no plan mode, no sub-agents** ("they confuse models — use a TODO.md file"), so routing signals *cannot* originate in the backend. The agent works; the Workflow routes.
- **Alternative considered:** Author a Pi adapter inside core-v2 for a faster end-to-end demo. Rejected — coupling core to `@earendil-works/pi-coding-agent` violates the plane separation and the plugin model; the reference mapping (Decision #7) proves the contract without the dependency.

## Risks / Trade-offs

- **[Risk] Concurrency of "poll exits while the agent runs."** Evaluating exits against live observation while consuming the event stream is the subtlest part. → Mitigation: the only interruption point is a tool-call boundary; the router is consulted synchronously between events, so there is no mid-tool race. A scripted source lets us test "exit fires at boundary N" deterministically.
- **[Risk] Park/wake deadlock.** A park stage that never receives a hook hangs `run()`. → Mitigation: the load-time park-stage check forbids a stage with neither a satisfiable internal exit nor an external route; parks always have a wake path (`status_changed` / forced `done`).
- **[Risk] Minimal `when` gives false confidence.** Shipping only names + bare keys may pass tests that the full grammar would fail. → Mitigation: the AST + validator are full from pass 1; unimplemented evaluator arms throw a clear "not yet supported" rather than silently returning `false`.
- **[Risk] `error` routing to `blocked` is under-specified.** → Mitigation: pass 1 surfaces `error` by rethrowing (or routing to `blocked` only when the workflow defines it); the `retry` field is honored in a later pass. Captured as an open question.

## Migration Plan

In-package, green-field runtime within `packages/core-v2/`. No deployed API changes. Sequencing within the one change:

1. **Green-up** (Decision #1): un-private harness fields, type-only `Agent` import, add the `AgentRuntime` engine + `scriptedSource`, harness takes an injected/resolved agent → `tsc` green, existing tests adjusted.
2. **Runtime `Step` + State ids** (Decision #6).
3. **`when` evaluator pass-1 + load-time validation** (Decision #5).
4. **`StateProvider` + `Router`** (Decision #4).
5. **`Harness.run` driving the agent + handoff** (Decisions #7–#10).
6. **`Workflow.run` stage machine** (Decision #3).

Each step keeps the build green and adds colocated tests (97% line/function, 95% branch).

## Open Questions

1. **`error` / `retry` routing.** Should `error` auto-route to `blocked`, honor `Step.retry` first, or rethrow when no `blocked` stage exists? *Proposed:* rethrow in pass 1; wire `retry` → `blocked` in a follow-up.
2. **Park wake granularity.** Does a parked stage re-run its step on wake, or only re-evaluate exits? *Proposed:* re-evaluate first; only re-run if a hook-fed exit routes back into a working stage.
3. **Reference backend & registration.** Pi is the reference source (authored in `workhorse-plugin-pi-adapter`); core-v2 ships only `AgentRuntime` + `scriptedSource`. Should a runnable end-to-end slice register a Pi source, or stay scripted until the Pi-source change? *Proposed:* scripted in core-v2 tests; the real Pi source is its own plugin change. Verify against the SDK then: that abort waits for the in-flight tool, and the exact `token_usage` event shape.
4. **Iteration cap.** Do we need a max-iteration guard on a working loop to prevent runaway loops when no exit ever matches (distinct from a park)? *Proposed:* surface `iteration_count` as a key now; add a config cap later.
5. **Notify timing.** Pi distinguishes *steering* (delivered at the next tool-call boundary) from *follow-up* (after all work). Does `Agent.notify` need to expose both, or is boundary-delivery (steering) enough for the handoff + out-of-band messages? *Proposed:* a single boundary-delivered `notify` (steering semantics); revisit if a use case needs after-all-work delivery.
