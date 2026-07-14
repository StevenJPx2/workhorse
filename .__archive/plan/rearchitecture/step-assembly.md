# Step-assembly seam

The seam between the config plane and the Harness: turn a `StepConfig` plus the inbound
transition handoff into the rig request the Harness drives, and let `WorkflowRun` supply that
handoff when an edge fires.

```rust
// the call the Harness ends up making
let msgs = assemble_request(step, task, handoff);   // handoff: Option<&str>
// → [ System(prologue), System(epilogue), User(handoff + "\n\n" + task) ]   // empty parts skipped
```

rig requires the user turn last — it is the prompt the model answers — so prologue and epilogue
are leading system framing, matching rig's own guidance ("preamble legacy; prefer leading
`Message::System`").

Three vertical slices. Each leaves the workspace green and is **idempotent**: every step names an
end-state contract plus its test, so re-running re-asserts the contract rather than appending.
Verify a slice with `cargo test -p runtime`; verify the whole with `cargo test`.

## Steps

- [x] **1 — Message assembly** (`runtime/src/step.rs`)
      `assemble_request(&StepConfig, task, Option<&str>) -> Vec<rig::Message>` ordered
      `System(prologue) → System(epilogue) → User(handoff + task)`, empty parts skipped, user turn last.
      Colocated test asserts order, empty-skip, user-last, and that the handoff precedes the task.

- [x] **2 — Harness consumes it**
      `Harness::run_step(&StepConfig, task, Option<&str>)` builds each model request from
      `assemble_request(...)` — the assembled list as history, its last entry the prompt — and passes the
      `AgentRun` history into the request. `MockClient` records the messages it receives. Test: prologue,
      epilogue, and handoff all land in the request the model sees.

- [x] **3 — `WorkflowRun` emits the handoff**
      `WorkflowRunStep::RunStage` carries `handoff: Option<String>` = the `epilogue` of the exit that
      routed into this stage; the entry stage is `None`. Test: an exit with an epilogue fires → the next
      `RunStage.handoff` is that text.

- [x] **4 — End-to-end verification**
      `cargo test` green across the workspace. `tests/seam_test.rs` drives
      `WorkflowRun` handoff → `assemble_request` → Harness, proving a `StepConfig` produces a real
      request whose user turn carries the prior stage's handoff.

## Contracts

`assemble_request` is pure — no IO, no Harness coupling — so it stays unit-testable on its own.

The handoff is one optional string threaded forward: `WorkflowRun` sets it from `CompiledExit.epilogue`
on the edge it takes, the Harness folds it into the user turn ahead of the task, and the step's own
`epilogue` closes the request as a trailing system message.
