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

- [ ] **1 — Drive stages to completion**
  `Orchestrator::run(initial_stage)` loops `WorkflowRun::next_step`: on `RunStage { stage, handoff }`
  it runs that stage's steps through the Harness — the first step receives the handoff — folds each
  step's output into the workflow state map, then calls `stage_complete`. Test: a two-stage
  always-exit program runs to `Done`.

- [ ] **2 — `when`-guarded loop**
  A stage whose exit routes back to an earlier stage re-runs until a guard flips. Test: an
  `iteration_count` loop runs the body exactly N times, then exits.

- [ ] **3 — Park & resume**
  On `Suspend`, `run` returns a resumable handle carrying the serialized `WorkflowRun`; `resume(event)`
  merges the event and drives to `Done`. Test: a stage parks, then a `StatusChanged` event resumes it
  to completion.

- [ ] **4 — Budget & cancel**
  The workflow token budget aggregates each step's usage across stages; a `CancellationToken` stops at
  the next stage boundary. Test: budget exceeded surfaces `BudgetExceeded`; cancel mid-run ends with a
  cancelled outcome and no further stage runs.

## Contracts

The Orchestrator owns no agent logic — it composes the two governors. Stage output → state mapping is
the one new policy: each step's final text lands under a state key the next stage's guards can read,
which is what closes the loop between a stage's work and its exit conditions.
