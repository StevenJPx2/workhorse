# Orchestrator

Drives a whole workflow: `WorkflowRun` at the stage grain × the Harness at the step grain, honoring
loops, parks, token budget, and cancellation.

```rust
let outcome = Orchestrator::new(program, toolset, model).run("planning").await?;
// RunStage → run each step via the Harness → fold output into state → stage_complete → loop / park / done
```

Steps are **idempotent**: each names an end-state contract plus its test. Verify with
`cargo test -p runtime`.

## Steps

- [x] **1 — Drive stages to completion**
      `run_to_completion` / `run_with_limit` loop `WorkflowRun::next_step`: on `RunStage { stage, handoff }`
      it runs the stage through the Harness (handoff folded in via `with_context`), collects the
      deterministic state the stage's tools published, then calls `stage_complete`. A two-stage program
      runs to `Done` (selfcheck preset run checks).

- [x] **2 — `when`-guarded loop**
      A stage whose exit routes back to an earlier stage re-runs until a guard flips — the **Ralph loop**
      (`work` ⇄ `memory_weaver`). Proven by `ralph_loop_advances_on_deterministic_counter_then_completes`
      and the live `--orchestrate=ralph-loop` run. A `run_with_limit` cap (`DEFAULT_MAX_STAGE_RUNS`)
      yields `Outcome::MaxIterations` for a non-converging loop.

- [x] **3 — Park & resume**
      On `Suspend` the orchestrator emits `Outcome::Suspended` and the caller keeps the serialized
      `WorkflowRun` (it _is_ the resumable handle). `resume_workflow(harness, program, run, …, event)`
      merges an `ExternalEvent`'s deterministic `updates` via `WorkflowRun::resume`, re-evaluates the
      parked stage's guards, and drives onward — advancing to `Done` if a guard now fires, or re-parking
      if not. Tests: `parks_then_resumes_on_external_event_to_done`, `resume_with_unsatisfying_event_reparks`,
      and selfcheck `check_resume` (the `in_review → done` sign-off pattern).

- [x] **4 — Budget & cancel**
      `run_with_limit` enforces a max-stage-run cap (`Outcome::MaxIterations`). **Token budget threads
      real usage:** the Harness surfaces per-stage `total_tokens` (incl. the live-session epilogue turn,
      via `add_usage`) on `HarnessEvent::Done`; `stage_tokens` feeds it to `stage_complete`, so the budget
      aggregates and `BudgetExceeded` can fire on real runs. **Cancellation:** `DriveOptions::with_cancel`
      carries a `tokio_util::sync::CancellationToken`; the driver checks it at each stage boundary (never
      mid-tool-call) and returns `Outcome::Cancelled`. (`run_with_limit`'s optional knobs — context reader
  - cancel — are bundled in `DriveOptions`.)

## Contracts

The Orchestrator owns no agent logic — it composes the two governors. The one policy: a stage's
**deterministic tool state** (`ToolResult.state`, surfaced via `HarnessEvent::Done.state`) is what
`stage_complete` routes on — never anything the agent asserts in prose. The finishing agent's response
to the chosen exit's epilogue (asked in its live session) becomes the next stage's handoff. This is
what closes the loop between a stage's work and its exit conditions.

## Built beyond this slice (this session)

The orchestrator grew past the original 4 steps: bundled `presets()` (`tiny`, `ralph-loop`),
`ContextService` (context.md memory channel) + demo `CounterService`, deterministic state routing
(no `@state` trailer — the agent never sets routing state), tool-owned state keys via
`Tool::produces()` + auto-seed + `validate_state_keys`, stage-entry snapshot guards (`<key>@entry`),
live-session epilogue handoffs, and the merged **stage = agent config + exits** model (steps removed).
Demo: Orchestrator panel + Builder panel. See `SESSION-LOG.md`.
