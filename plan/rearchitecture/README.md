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
| `orchestrator.md` | planned — composes `WorkflowRun` × Harness end to end |

Cross-cutting: **`demo.md`** — every slice ships a human-testable panel in `rust/wh-demo/`
(native egui). `cargo run -p wh-demo` to poke it; `-- --selfcheck` for a headless proof.

## Status

- **Spikes A–E: validated.** Tool bridge, sandbox boundary, config→pipeline + `when`, Harness
  driving `AgentRun`, `WorkflowRun` governor — all proven against real rig 0.39 / wasmtime 45.
- **Seam: done.** A `StepConfig` plus an exit handoff produces a real model request end to end.
- **Current test count: 68 + 2 `#[ignore]` real-model tests (Anthropic + opencode zen), all green.**
- **Real models wired.** `Harness<M: CompletionModel>` is generic. Three real providers:
  **Anthropic** (`anthropic_model` via rig's native provider, `ANTHROPIC_API_KEY`, default
  `claude-sonnet-4-6`), **`OpenAI`-compatible** (`openai_compat_model`, `OPENCODE_API_KEY`,
  opencode zen `mimo-v2.5`), and **genai** (`GenAiModel` — 25+ providers via genai's native
  protocol client, auth via provider env vars or custom `AuthResolver`). `resolve_provider_from_env()`
  tries Anthropic first, then openai-compat, else Mock. The `opencode-anthropic-auth` plugin injects
  `ANTHROPIC_API_KEY` via env vars, which the Rust side reads directly.
- **Human-testable:** `rust/wh-demo/` (native egui) — panels for the `when` language, the
  config→pipeline compiler, the `WorkflowRun` governor (run→park→resume→done), the **Harness**
  (Mock/Real toggle — real uses Anthropic or openai-compat via `resolve_provider_from_env()`),
  and the **Registry** — registers the real `ScriptService` and calls
  `run_script`/`read_script`/`write_script` (each tool shows the description + JSON schema the
  agent sees) against a live `.workhorse/scripts` dir, executing through the sandbox.
  Build a fresh panel each slice (see `demo.md`).
- **Next:** `orchestrator.md` — composes `WorkflowRun` × Harness end to end.

## Crates (`rust/`)

```
tools/     Tool model (define_tool) + rig ToolDyn bridge
sandbox/   Sandbox trait + WasiSandbox (wasmtime + WASI preopen) + LocalSandbox (dev shell)
pipeline/  Expr/`when` parser+evaluator + config→pipeline compiler
runtime/   Harness (drives AgentRun) + WorkflowRun governor + step assembly + mock model
services/  Service/Contribution contract + Registry + built-in services (ScriptService)
wasm-probe/   tiny wasm fixture the sandbox tests run
wh-demo/   native egui smoke-test app (its own workspace; path-deps pipeline + runtime + services)
```

The `wh` facade and `macros` proc-macro crate are specced in `rust-port.md`, not yet built.

## Build & test

The repo pins `nightly-2026-01-08` + `wasm32-wasip1` via `rust/rust-toolchain.toml` (wasmtime 45
needs rustc ≥ 1.93). A Homebrew `cargo` (1.96) sits first in `PATH` and **ignores** that file — it
compiles the workspace fine but has no wasm target. Put the pinned toolchain first so plain `cargo`
just works:

```bash
export PATH="$HOME/.rustup/toolchains/nightly-2026-01-08-aarch64-apple-darwin/bin:$PATH"
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
