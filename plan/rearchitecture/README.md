# Workhorse Rust port — start here

A from-scratch Rust rewrite of `packages/core-v2/`, built on **rig** as the substrate. rig supplies
the engine (agent loop, `ToolSet`, pipelines, extractors); workhorse keeps only its governance
philosophy custom. Read this first in any new session.

## Read order

1. **`rust-port.md`** — the architecture spec: rig as substrate, the `WorkflowRun` governor,
   config→pipeline compiler, services/plugins, the 4+1 crates, conventions.
2. **The active slice plan** — whichever file below still has unchecked `[ ]` steps.
3. **`SESSION-LOG.md`** — the latest entry: what landed last, what's next, any new gotcha.

Slice plans (each = one vertical slice, idempotent steps with tests):

| Plan | State |
|---|---|
| `step-assembly.md` | ✅ done — config `StepConfig`/exit-epilogue → rig request the Harness drives |
| `genai-model.md` | ✅ real models wired — Harness generic over `M`; Anthropic (native Claude) + `OpenAI`-compat (opencode zen) + genai shim (25+ providers via `GenAiModel`) + OAuth PKCE. |
| `registry-services.md` | ✅ done — services contribute tools via `Service` trait; `Registry` builds fresh `ToolSet` per run; teardown fires once per run. |
| `scripts.md` | ✅ done — `ScriptService` (first real service): discovers `.sh` scripts, `run_script`/`read_script`/`write_script` tools, sandbox-mediated execution (`LocalSandbox` dev, `WasiSandbox` prod). |
| `orchestrator.md` | ✅ mostly done — `run_to_completion`/`run_with_limit` compose `WorkflowRun` × Harness; presets, deterministic-state routing, `@entry` guards, live-session epilogues, merged stage model. Remaining: park & resume + external events; token-budget threading. |

Cross-cutting: **`demo.md`** — every slice ships a human-testable panel in `rust/wh-demo/`
(native egui). `cargo run -p wh-demo` to poke it; `-- --selfcheck` for a headless proof.

## Status

- **Spikes A–E: validated.** Tool bridge, sandbox boundary, config→pipeline + `when`, Harness
  driving `AgentRun`, `WorkflowRun` governor — all proven against real rig 0.39 / wasmtime 45.
- **Orchestrator: end to end.** `run_to_completion`/`run_with_limit` compose `WorkflowRun` (stage grain)
  × Harness (step grain). Bundled `presets()` (`tiny`, `ralph-loop`); the Ralph loop iterates
  `work ⇄ memory_weaver` and converges live. Routing is **deterministic** — tools publish
  `ToolResult.state` (the agent never asserts routing state); tools own their keys via
  `Tool::produces()`; guards can read the stage-entry snapshot `<key>@entry`; the chosen exit's
  epilogue is asked in the finishing agent's live session and its response is the next handoff.
- **Config model: merged.** `states` is a name-keyed map with a top-level `initial`; a **stage IS its
  agent config + exits** (steps removed). Looping is exit-driven (`builtin::paused` fallback).
- **Current test count: 88 + 2 `#[ignore]` real-model tests, all green; wh-demo +2.**
- **Real models wired.** `Harness<M: CompletionModel>` is generic. Three real providers:
  **Anthropic** (`anthropic_model` via rig's native provider, `ANTHROPIC_API_KEY`, default
  `claude-sonnet-4-6`; plus the OAuth/Pro-Max direct path in `anthropic_direct.rs` with real
  content-block tool-calling), **`OpenAI`-compatible** (`openai_compat_model`, `OPENCODE_API_KEY`,
  opencode zen `mimo-v2.5`), and **genai** (`GenAiModel` — 25+ providers; non-streaming + streaming both implemented).
  `resolve_provider_from_env()` tries Anthropic first, then openai-compat, else Mock.
- **Human-testable:** `rust/wh-demo/` (native egui) — panels for the `when` language, the
  config→pipeline compiler, the `WorkflowRun` governor, the **Harness** (Mock/Real toggle), the
  **Registry** (real `ScriptService`), the **Orchestrator** (run a preset workflow end to end — plus
  a Cancel button, a persist-run + reload/resume-from-disk flow, a sub-agent/`ask_parent` demo, and a
  `load from .workhorse` button driving the `wh` facade), and a drag-and-drop **Builder** (flowchart +
  bidirectional TOML). `--orchestrate[=preset]` is a headless runner. Build a fresh panel each slice
  (see `demo.md`).
- **Next:** token-budget threading (close the flat-0 seam) → orchestrator park & resume + external
  events (`orchestrator.md` step 3) → sub-agents (`spawn_subagent`/`ask_parent`).

## Crates (`rust/`)

```
tools/     Tool model (define_tool) + rig ToolDyn bridge
sandbox/   Sandbox trait + WasiSandbox (wasmtime + WASI preopen) + LocalSandbox (dev shell)
pipeline/  Expr/`when` parser+evaluator + config→pipeline compiler
runtime/   Harness (drives AgentRun) + WorkflowRun governor + Orchestrator + presets + sub-agents + persistence + step assembly + mock model
services/  Service/Contribution contract + Registry + built-in services (ScriptService, ContextService)
wh/        facade: .workhorse config discovery + preset cascade (global->project->workflow) + prepare_workflow
wasm-probe/   tiny wasm fixture the sandbox tests run
wh-demo/   native egui smoke-test app (its own workspace) — when/compiler/governor/harness/registry/orchestrator/builder panels + demo CounterService
```

The `wh` facade now exists (config discovery + preset cascade + `prepare_workflow`); the heavier
bootstrap it will grow into (GlobalContext/WorkflowContext, DB, hooks bus, issue intake, worktree
creation) is deferred to when those integrations land. The `macros` proc-macro crate is still specced
in `rust-port.md`, not yet built.

## Build & test

The repo pins **`channel = "stable"`** + `wasm32-wasip1` via `rust/rust-toolchain.toml` (the code uses
zero unstable features; wasmtime 45 needs rustc ≥ 1.93, so keep `rustup` updated). `unsafe_code =
"forbid"` is enforced in both workspaces. CI lives at `.github/workflows/rust-ci.yml` (core + wh-demo
jobs: `fmt --check` + `clippy --all-targets -D warnings` + `test`; wh-demo also runs `--selfcheck`).

```bash
cd rust
cargo test                                          # full workspace
cargo test -p runtime                              # one crate
cargo build -p wasm-probe --target wasm32-wasip1    # rebuild the sandbox fixture after editing it
cargo run -p wh-demo                                # open the native egui smoke-test app
cargo run -p wh-demo -- --selfcheck                 # headless: prove the panels' wiring (CI-able)
cargo run -p wh-demo -- --auth                      # interactive Anthropic OAuth login (Pro/Max)
```

The sandbox test reuses a cached `target/wasm32-wasip1/debug/wasm-probe.wasm`; rebuild it with the
pinned toolchain whenever `wasm-probe` changes, or the test runs against stale bytes.

## API gotchas (learned, load-bearing)

- The crate is **`rig`** on crates.io, not `rig-core`.
- rig's `Tool` is not object-safe (assoc const + RPITIT) → adapt through `ToolDyn`; that bridge is
  the single adaptation point from `wh::Tool`.
- `AssistantContent::tool_call(id, name, args)` — **id first**. Gating validates `function.name`
  against `allowed_tool_names`, so a swapped arg silently routes to "invalid tool call".
- rig's WASI sync path calls `block_on`; running it inside tokio panics → the sandbox uses
  `spawn_blocking` with the sync WASI linker.
- A rig request's **last message is the prompt**; prologue/epilogue are leading `Message::System`,
  the user turn is last.

## Starting a session

1. Read this file, then `rust-port.md`, then the active slice plan + latest `SESSION-LOG.md` entry.
2. `export PATH=…` (pinned toolchain), `cargo test` — confirm a green baseline before changing code.
3. Recreate the working todo list from the active slice plan's unchecked steps (the in-session todo
   tool does not persist; the slice plans are the durable source of truth).

## Ending a session

1. `cargo test` — leave the tree green, or note in the log exactly what is red and why.
2. In the slice plan you worked: tick `[x]` each finished step; add a one-line status under any
   step left partially done.
3. **Demo:** extend `rust/wh-demo/` with a panel for what the slice added, and keep
   `cargo run -p wh-demo -- --selfcheck` green (see `demo.md`). A slice isn't done without it.
5. Update the **Status** section above (test count, what's next).
6. Append an entry to `SESSION-LOG.md`: date, what landed, test count, the next concrete action, and
   any new gotcha worth pinning here.
7. Keep design docs clean — record history in `SESSION-LOG.md`, never as changelog prose inside
   `rust-port.md` or the slice plans (see `.claude/skills/writing-plans`).
