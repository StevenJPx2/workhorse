# Demo surface — human-testable proof per slice

Every slice ships a way for a human to _see and poke_ what it built. The proof lives in
`rust/wh-demo/`, a native [egui](https://github.com/emilk/egui)/eframe app — one window,
real crate wiring, no logic mocked.

> Run it: from `rust/`, `cargo run -p wh-demo` (it's outside the core workspace, so the
> `cargo test` loop stays fast). No browser, no wasm, no daemon — just a window.

## Why egui-native (not a website)

- **Wires the real crates.** Panels call `parse_expr`, `compile_stage`,
  `WorkflowRun::next_step`, etc. directly — what you click is what the runtime does.
- **Zero ceremony to test.** `cargo run -p wh-demo` opens a window. No bundler, no serve step.
- **Native has the full stack.** tokio + rig are available, so harness/agent panels can land
  here later without a second toolchain. (A wasm/web target was explicitly dropped.)

## Panels today

| Panel                 | Crate / spike               | What a human can do                                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **when expr**         | `pipeline` (C)              | Type a `when` guard → see the parsed `Expr` AST + the state keys it reads → evaluate it against an editable JSON state map.                                                                                                                                                                                                                 |
| **config → pipeline** | `pipeline` (C)              | Edit a snake_case workflow config (TOML) → compile it → inspect each stage's `when`-guarded exits → run a stage's lowered `ValueOp` pipeline on a JSON input.                                                                                                                                                                               |
| **WorkflowRun**       | `runtime` (E)               | Hand-drive the sans-IO governor: `next_step` → `stage_complete` → **park** → `resume` → **done**, watching the live serialized snapshot (the proof a parked run round-trips to JSON).                                                                                                                                                       |
| **Harness**           | `runtime` (D + real models) | Drive `Harness<M: CompletionModel>` and watch the `HarnessEvent` stream. **Mock** is offline (scripted response); **Real** calls **Anthropic** (`claude-sonnet-4-6`, `ANTHROPIC_API_KEY`) or **openai-compat** (`mimo-v2.5`, `OPENCODE_API_KEY`) via `resolve_provider_from_env()`.                                                         |
| **Registry**          | `services` + `sandbox`      | Register the real `ScriptService` against an editable cwd, build a `ToolSet`, and call each contributed tool individually (each row shows the description + JSON input schema the agent sees) — `write_script` saves a real `.sh`, `read_script` shows its source, `run_script` runs it through the `Sandbox` (`LocalSandbox` in the demo). |

## The standing rule

**Each new slice extends `wh-demo` with a panel (or enriches one) that lets a human exercise
the behavior it added.** A slice is not done until its demo panel is.

- Pure, sans-IO surfaces (pipeline, `WorkflowRun`) are trivial to panel — bind inputs to the
  real functions and render the output.
- Host-bound surfaces (sandbox exec, a genai-backed harness) panel as native-only actions
  (button → `block_on`/spawn → render events), since the demo is a native binary.
- Keep panels small (one file per panel under `src/`, following the ≤200-line convention).

## How it stays decoupled

`wh-demo` is a separate crate excluded from the core workspace (`exclude = ["wh-demo"]` in
`rust/Cargo.toml`). The pure core was made wasm-clean as a side benefit — `pipeline` dropped
its unused `rig` dep, and `runtime` gates the Harness/mock-model/step modules behind a
default `native` feature so `WorkflowRun` builds standalone. That keeps a future web target
_possible_ without committing to one now.
