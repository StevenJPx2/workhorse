# Session log

Append-only handoff record. Newest entry first. Design decisions live in `rust-port.md` and the slice
plans; this file is the running history of what happened each session.

Entry template:

```
## YYYY-MM-DD — <one-line summary>
- Landed: <what shipped>
- Tests: <count> green (or: red, <why>)
- Next: <the single next concrete action>
- Gotchas: <anything new worth pinning in README.md>
```

---

## 2026-06-23 — sandbox-mediated script execution + `read_script` + `LocalSandbox`

- Landed: all `ScriptService` execution now goes through the `Sandbox` trait — `run.rs` builds a `SandboxCommand` (`/bin/sh -c <body>`, cwd preopened) and calls `Arc<dyn Sandbox>::exec`; the service never spawns a process directly. New `LocalSandbox` (sandbox crate) runs the command as a cap-scoped local process (dev default); `WasiSandbox`(busybox.wasm)/VM is the documented prod path — swappable with no service change. `ScriptService::new(cwd, home, sandbox)` takes the sandbox. Added `read_script` tool (returns raw `.sh` source). Discovery de-dupes first-wins (cwd shadows home). Registry demo panel shows each tool's agent-facing description + JSON input schema and renders the exact wire `ToolResult` the agent receives.
- Tests: 68 green + 2 `#[ignore]` (sandbox +2 LocalSandbox, services +1 read/dedup). Both clippy gates clean; selfcheck's 4 registry checks pass (write→read→run in sandbox); only the opt-in Anthropic real call shows 429/credit.
- Next: `orchestrator.md` — compose `WorkflowRun` × Harness end to end.
- Gotchas: `LocalSandbox::exec` runs inline (no `tokio::task::spawn_blocking`) so it works under both a tokio reactor and bare `pollster::block_on` (the demo/selfcheck path) — spawn_blocking panics with "no reactor" under pollster. `SandboxCommand` maps a script to `program=/bin/sh`, `args=["-c", body]`, cwd = first preopen's host dir.

---

## 2026-06-23 — `services` crate + first real service (`ScriptService`)

- Landed: new `services` crate holding the `Service`/`Contribution` contract + `Registry` (moved out of `tools`, which keeps only tool primitives). `Service::setup` now takes `self: Arc<Self>` so services hand their `Arc` to tool closures. First real service: `ScriptService` — discovers `.sh` from `<cwd|home>/.workhorse/scripts`, `#`-commented-YAML front-matter parse/serialize, `run_script` + `write_script` tools, real `/bin/sh` execution (options→env, positional→`set --`). wh-demo Registry panel now registers the real `ScriptService` against a live cwd; selfcheck writes + discovers + runs a real script. See `scripts.md`.
- Tests: 65 green + 2 `#[ignore]` (services adds 14). Both clippy gates clean; selfcheck green (registry checks pass; only the opt-in Anthropic real call shows 429 rate-limit).
- Next: `orchestrator.md` — compose `WorkflowRun` × Harness end to end.
- Gotchas: `Service::setup(self: Arc<Self>)` (not `&self`) — required so a service can capture its own `Arc` into the tool closures it builds; `Registry::build_toolset` calls `svc.clone().setup(...)`. The WASM-only sandbox can't run shell, so `ScriptService` shells out to `/bin/sh` directly (the TS reference uses in-memory `just-bash`).

---

## 2026-06-23 — registry-services slice + Anthropic streaming fix

- Landed: `Service` trait + `Contribution` in tools crate; `Registry` builds fresh `ToolSet` per run via `build_toolset(&ctx)`; teardown fires once per run. wh-demo has Registry panel (register + build, call tool, fresh-set-per-run, teardown). Anthropic direct model now streams via SSE parsing; system prompt sent as array (API requirement). 54 tests + 2 ignored (real-model), all green.
- Tests: 54 green + 2 `#[ignore]` (Anthropic + opencode zen)
- Next: `orchestrator.md` — compose `WorkflowRun` × Harness end to end.
- Gotchas: Anthropic streaming API requires `system` as `[{type:"text",text:...}]` array, not a plain string. Direct model's `stream()` parses SSE `content_block_delta` events for text chunks.

---

## 2026-06 — real model wired (genai-model slice) + Harness demo panel

- Landed:
  - **`Harness<M: CompletionModel>`** — generic over the model (was hardcoded `MockCompletionModel`).
    Existing tests pass unchanged (mock satisfies the bound). Test fixtures now call
    `MockCompletionModel::make` via a `use rig::completion::CompletionModel as _;` import, since the
    generic field no longer pins the impl for inference.
  - **`runtime::openai_compat_model(base, key, model)`** (`runtime/src/model.rs`, native-only) —
    builds a real rig openai-compat `CompletionModel` (`CompletionsClient::builder().api_key().base_url()
    .build()?.completion_model(id)`). **Discovery:** opencode zen go is OpenAI chat-completions
    compatible, so rig's own provider IS the shim — no genai crate, no request/response mapping.
    `opencode_creds_from_env()` reads `OPENCODE_API_KEY` (+ optional `OPENCODE_BASE_URL`/`OPENCODE_MODEL`;
    defaults to `https://opencode.ai/zen/go/v1` + `mimo-v2.5`); absent key → `None` → mock fallback.
  - **Opt-in live test** `runtime/tests/harness_test.rs::real_opencode_zen_completion` (`#[ignore]`,
    skips without a key). Ran it live: **1 passed in 10.14s** against `mimo-v2.5`.
  - **wh-demo Harness panel** — Mock/Real toggle (Real disabled until key set; real calls drive a
    `tokio::runtime::Runtime` since reqwest needs a reactor, while the mock path stays on pollster).
    `--selfcheck` adds a mock harness check always + a real check only when the key is present (it
    succeeded live in this session).
  - Updated `genai-model.md` (steps 1–3 done; genai shim deferred to step 4, only if a provider rig
    can't host). Bumped wh-demo deps: added `rig` (CompletionModel trait) + `tokio` (reactor).
- Tests: 51 + 2 `#[ignore]` green; clippy pedantic `-D warnings` clean in both workspaces;
  `wh-demo -- --selfcheck` green (incl. a live real-model call when keyed).
- Follow-up (same session): **genai shim** — `runtime/src/genai_model.rs` implements rig's
  `CompletionModel` for genai's `Client` (25+ providers). `GenAiModel::new(client, model)` with
  `GenAiClient::default_client()` (reads provider env vars) or `GenAiClient::with_auth_resolver()`
  (custom OAuth). Maps rig messages → genai `ChatRequest`, tool definitions → genai `Tool`, and
  response `ContentPart` back to rig `AssistantContent`. Streaming returns an error (not yet wired).
  `genai = "0.7.0-beta.5"` added as optional dep of `runtime` (behind `native` feature).
- Follow-up (same session): **OAuth Pro/Max auth fixed end-to-end** — discovered that rig's
  native Anthropic client and genai's `RequestOverride` both fail with Pro/Max OAuth tokens
  (rig sends `x-api-key`, but Pro/Max needs `authorization: Bearer`; genai's override doesn't
  apply headers correctly). Solution: `runtime/src/anthropic_direct.rs` — a lightweight direct
  reqwest client implementing rig's `CompletionModel` that sends `authorization: Bearer` +
  `anthropic-beta` headers. `anthropic_model_from_oauth()` uses this client; `anthropic_model_from_creds()`
  uses rig's native client for API keys. Also fixed: `anthropic_creds_from_env()` now checks for
  non-empty `ANTHROPIC_API_KEY` (empty string from `ENV= cargo run` was incorrectly taking precedence
  over stored OAuth tokens). Verified: `cargo run -p wh-demo -- --selfcheck` with `ANTHROPIC_API_KEY=`
  connects to Anthropic API with Bearer auth, gets 429 (rate limited) confirming auth works.
- Follow-up (same session): **Anthropic provider** added to `runtime/src/model.rs` —
  `anthropic_model(api_key, model, base_url?)` via rig's native Anthropic provider. `anthropic_creds_from_env()` reads
  `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL`); default model is `claude-sonnet-4-6`.
  `resolve_provider_from_env()` tries Anthropic first, then openai-compat, else Mock. An `#[ignore]` test
  `real_anthropic_completion` added. The `opencode-anthropic-auth` plugin injects `ANTHROPIC_API_KEY` via env vars,
  which the Rust side reads directly — no file parsing needed. Added `reqwest = "0.13"` as a direct optional dep
  (rig uses 0.13; naming `AnthropicCompletionModel<reqwest::Client>` required it).
- Next: `registry-services.md` — services contribute a fresh `ToolSet` per run.
- Gotchas: real `Harness::run` needs a tokio reactor (pollster panics on reqwest); opencode zen model
  id is `mimo-v2.5` (no literal `-free` suffix — the free tier is the `/zen/go/v1` endpoint). Anthropic and
  openai-compat reqwest versions must match rig's — currently 0.13.

## 2026-06 — wh-demo egui smoke-test surface + demo-per-slice rule

- Landed:
  - **`rust/wh-demo/`** — a native egui/eframe app wiring the real crates (no mocked logic),
    its own workspace (`exclude = ["wh-demo"]`) so the core test loop stays fast. Three panels:
    `when` expr (parse→AST→eval), config→pipeline compiler (compile + run a stage's `ValueOp`),
    and the `WorkflowRun` governor stepper (run→gate→park→resume→done with a live serialized
    snapshot). Plus `--selfcheck`: a headless, CI-able proof of the panels' exact wiring.
  - **Decoupled the pure core for wasm-cleanliness** (web target itself dropped per decision):
    `pipeline` lost its unused `rig`/`schemars`/`async-trait` deps; `runtime` gates
    Harness/mock_model/step behind a default `native` feature so `WorkflowRun` builds standalone.
    Verified `pipeline` + `runtime --no-default-features` compile to `wasm32-unknown-unknown`.
  - **Bug fix:** the `when` evaluator compared `==`/`!=` structurally, so `count == 0` (parsed
    f64) failed against an integer state value. Now compares numerically when both sides are
    numbers. Added a regression test (`evaluate_numeric_eq_int_state_against_parsed_float`).
  - **Demo-per-slice rule** baked into `demo.md` (new), `rust-port.md` conventions, and the
    README start/end rituals + status.
- Tests: 51 green (`cargo test`); `wh-demo -- --selfcheck` green.
- Follow-up (same session): **`clippy::pedantic` now enforced workspace-wide** via
  `[workspace.lints]` (+ `[lints] workspace = true` in every crate; `wh-demo` has its own
  `[lints.clippy]` since it's a separate workspace). Fixed all resulting lints — `# Errors`/
  `# Panics` docs, `#[must_use]` on builders/getters/`define_tool`, doc backticks,
  `map_or`/`is_none_or`/`is_some_and` rewrites, elided lifetimes, `.display()` over `{:?}` on
  paths, one intentional `#[allow(clippy::float_cmp)]` (discrete `when` values). `cargo clippy
  --workspace --all-targets -- -D warnings` is clean; CI should gate on that.
- Follow-up: **Phosphor UI lint** — `wh-demo/tests/ui_icon_lint.rs` fails on any literal
  non-ASCII glyph in egui panel source (icons/separators must be `egui_phosphor::regular::*`
  constants). It caught a real em-dash in the sample TOML and `·` separators that would tofu;
  both fixed (latter now `DOT_OUTLINE`).
- Follow-up: zeroed all clippy/compiler warnings across the workspace —
  `mock_model` completion/stream rewritten as `async fn` (kills refining-impl-trait +
  into_iter + async-fn-syntax lints); `pipeline::GuardOp`/`ChainOp`/`ClosureOp` now exported
  (were dead code); collapsed `if let` chains in `compiler.rs`/`parse.rs`. `cargo clippy
  --workspace --all-targets` is clean. Demo icons now all [egui-phosphor]; bumped to the
  latest egui/eframe 0.34.3 + egui-phosphor 0.12 (migrated `App::update`→`App::ui` +
  `Panel::top`/`show_inside`). Stray `→` chars were tofu under the phosphor font merge —
  replaced every UI-rendered arrow with `icon::ARROW_RIGHT`.
- Next: `genai-model.md` step 1 — make the Harness generic over `CompletionModel<M>`.
- Gotchas: `WorkflowRun` exit guards error on an unknown state key (not falsy) — seed every key
  a guard reads before stepping. `wh-demo` is native-only and outside the core workspace; build
  it with `cargo run -p wh-demo`. trunk + `wasm32-unknown-unknown` are installed but unused.

## 2026-06 — Spikes A–E validated; step-assembly seam built

- Landed:
  - Cargo workspace `rust/` with `tools`, `sandbox`, `pipeline`, `runtime`, `wasm-probe`;
    `rust-toolchain.toml` pins nightly-2026-01-08 + `wasm32-wasip1`.
  - **Spike A** — `define_tool` → `Arc<dyn Tool>` → `RigToolBridge` (rig `ToolDyn`) → `ToolSet`.
  - **Spike B** — `WasiSandbox` runs a real wasm binary under wasmtime+WASI; preopen confines FS.
  - **Spike C** — `when` parser → `Expr` ADT + evaluator; config→pipeline compiler.
  - **Spike D** — Harness hand-drives rig `AgentRun` (gating · truncation · cancel · token budget).
  - **Spike E** — `WorkflowRun` governor: `when`-loop, suspend/serialize, resume, cancel, budget.
  - **Seam** (`step-assembly.md`, all 4 steps): `assemble_request` (prologue/epilogue → leading system,
    user turn last); `Harness::run_step(step, task, handoff)` passes `AgentRun` history into the
    request; `MockClient` records messages; `WorkflowRunStep::RunStage` carries the fired exit's
    epilogue as `handoff`; `seam_test.rs` proves the path end to end.
  - Wrote slice plans `genai-model.md`, `registry-services.md`, `orchestrator.md`.
- Tests: 50 green (`cargo test`).
- Next: `genai-model.md` step 1 — make the Harness generic over `CompletionModel<M>` so the real
  genai model drops in without further Harness changes.
- Gotchas (now in README.md): crate is `rig` not `rig-core`; `tool_call(id, name, args)` id-first;
  wasmtime sync WASI needs `spawn_blocking`; rig request's last message is the prompt; wasmtime 45
  needs rustc ≥ 1.93 and Homebrew cargo shadows the pinned toolchain.
