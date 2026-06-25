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

## 2026-06-24 — fix Anthropic 400 (empty content blocks) + sub-agent demo promoted to a preset

- **Fixed Anthropic 400 `"text content blocks must be non-empty"`** (anthropic_direct.rs `to_anthropic_messages`): the model frequently emits an assistant turn whose text part is `""` alongside a tool_use, and a tool can return empty output — both produced empty content blocks the OAuth gateway rejects. Now: `push_text_block` skips empty/whitespace-only text (user + assistant), `tool_result_text` substitutes `"(no output)"` for empty tool results, and empty `System` blocks are skipped. The `if !blocks.is_empty()` guard already dropped all-empty messages. 2 unit tests; confirmed live — `--orchestrate=ralph-loop` (multi-tool, text+tool-call turns) now reaches Done against real Anthropic OAuth where it previously 400'd.
- **Sub-agent demo is now a bundled preset, not a panel button**: moved `SUBAGENT_DEMO_CONFIG`/`SUBAGENT_DEMO_PROMPT` into `runtime` and added a third `presets()` entry `subagent-demo`. Removed the panel's local const + `load sub-agent demo` button — it's selectable from the preset dropdown like the others, and the panel's `uses_subagents(config)` gate already wires `spawn_subagent` per arm. selfcheck: the counter-only preset loop `continue`s past `subagent-demo` (it needs a live spawn tool; covered by the dedicated `check_subagent`, now using `runtime::SUBAGENT_DEMO_CONFIG`); the builder round-trip loop covers it too.
- Tests: runtime lib 36 (+2 empty-block). Both clippy gates clean, fmt clean, icon-lint + selfcheck green (incl. subagent-demo builder round-trip).

## 2026-06-24 — Orchestrator panel upgrade: cancel + persistence + sub-agents + wh-facade load

- Made this session's runtime features interactively testable in the wh-demo Orchestrator panel (they previously had only selfcheck/CLI coverage):
  - **Cancel button**: `OrchestratorState.cancel: Option<CancellationToken>` + `new_cancel()`; the threaded (real) arms drive with `.with_cancel(&token)`; a Cancel button shown while running fires it → the driver stops at the next boundary → `Outcome::Cancelled`. (Mock runs inline, so cancel is real-run-only.) Added `tokio-util` as a direct wh-demo dep.
  - **Persistence toggle + resume-from-disk**: a `persist run` checkbox wires `.with_persist(RunStore::for_issue(cwd, "orch-mock"))` (mock path); the run.json path is logged; when a run parks, a `reload & resume` group appears with an ExternalEvent JSON box and a button that `RunStore::load()`s + `resume_workflow`s to Done.
  - **Sub-agent + ask_parent demo**: `SUBAGENT_DEMO_CONFIG` (work stage spawns a `researcher`) + a `load sub-agent demo` button; `add_spawn_tool(toolset, model, cwd)` adds `spawn_subagent` (lone researcher template, empty leaf tools so the leaf gets only `ask_parent`) per provider arm where the concrete model exists; `uses_subagents(config_toml)` gates it. The mock script sequences spawn → ask_parent → parent answer → leaf final → increment → final (shared mock, call-order).
  - **wh-facade load**: a `.workhorse dir` + `workflow` name + `load from .workhorse` button calls `wh::load_workflow` and loads the cascaded TOML into the panel.
- Wiring notes: each Anthropic branch (OAuth vs key) builds its OWN toolset inside the branch so `add_spawn_tool` can capture that branch's concrete model (rig `ToolSet` isn't Clone). `CompletionModel` imported by name (was `as _`) for the `add_spawn_tool<M>` bound.
- Both clippy gates clean, fmt clean, icon-lint pass (all UI glyphs are `icon::*` constants), offline selfcheck 0 failures, GUI launches without first-frame panic.

## 2026-06-24 — `wh` facade: config discovery + preset cascade + prepare_workflow

- Landed: new core-workspace crate `wh` (rust/wh/, deps pipeline+runtime). `wh::config` discovers + cascades; `wh::prepare_workflow(cwd, home, name)` reads `<cwd>/.workhorse/workflows/<name>.toml` (falls back to `<home>`), layers global (`<home>/.workhorse/config.toml`) + project (`<cwd>/.workhorse/config.toml`) `[presets.*]` patches (global → project → workflow, later wins, by-key extend), and `compile_stage`s to a runnable WorkflowProgram. This finishes the config cascade deferred from the preset slice — a project can retune a preset for the whole repo without editing workflow TOML, and a workflow's own `[presets]` still wins. Errors: `ConfigError` (WorkflowNotFound / Read / Parse), `WhError` (Config / Compile).
- Scope: the facade is the load+cascade+compile path only. The full Orchestrator bootstrap (GlobalContext/WorkflowContext, DB, hooks bus, issue intake via one-off agent + Jira/GitHub MCP, worktree/branch creation) is deferred to when those integrations land. The host (wh-demo) still supplies model/provider + service toolset and drives with run_with_limit.
- Tests: wh crate 5 (3 config cascade incl. project-over-global + workflow-overrides-both + missing-workflow; 2 facade prepare/missing). Demo selfcheck `check_wh_facade` (writes a temp .workhorse, prepares, asserts cascade). Both clippy gates clean, fmt clean, icon-lint + selfcheck green. `wh` added to core workspace members; wh-demo path-deps it.
- Gotcha: `WorkflowProgram` doesn't impl Debug, so `.expect()`/`.unwrap_err()` on `Result<WorkflowProgram, _>` won't compile — use `let Ok(p) = ... else { panic! }` / `matches!(result, Err(...))`. selfcheck.rs is compiled into the BINARY (not a test) so it can't use the `tempfile` dev-dep — use std::env::temp_dir() + PID subdir.

## 2026-06-24 — genai streaming implemented (was a stub)

- Landed: `GenAiModel::stream()` (rust/runtime/src/genai_model.rs) — was `Err("streaming not implemented")`. Now calls `exec_chat_stream` with `ChatOptions::with_capture_usage(true)` and lazily maps the genai `ChatStream` (`futures::StreamExt::filter_map`) to rig `RawStreamingChoice`s: `Chunk` → `Message(text)`, `ToolCallChunk` → `ToolCall(call_id, fn_name, fn_arguments)`, `End` → `FinalResponse(GenAiStreamChunk{ input/output tokens from captured_usage })`; Start/Reasoning/ThoughtSignature skipped; errors → `CompletionError::ProviderError`. `GenAiStreamChunk` gained `input_tokens`/`output_tokens` (+ `GetTokenUsage` now reports them) so streamed usage bills correctly.
- The OAuth `anthropic_direct.rs` reuses `GenAiStreamChunk` for its own SSE `FinalResponse` — updated those two constructions to `..Default::default()`. NOTE: that path still doesn't parse usage out of its SSE message_start/message_delta (input/output_tokens stay 0 on the OAuth stream) — a separate follow-up.
- Tests: no new (genai streaming needs a live provider; no mock). Both clippy gates clean, fmt clean, selfcheck green. Fixed a drifted pedantic lint: main.rs `drive_workflow` hit 107 lines after the DriveOptions calls — hoisted `let opts = DriveOptions::default().with_context(&context_reader)` before the match so the 4 arms share it.
- Next: wh facade / orchestrator bootstrap (GlobalContext/WorkflowContext + issue intake + global/project config cascade).

## 2026-06-24 — preset inheritance (preset→stage merge)

- Landed: the `preset` field (kept through the steps-merge but never resolved) now does something. `WorkflowConfig.presets: HashMap<String, StepConfig>` (`[presets.<name>]`). `pipeline::merge_step(base, over)` merges a preset under a stage's explicit step: scalar Options take `over` when Some else inherit `base`; Vec fields (tools/services/sub_agents) take `over` when non-empty else inherit `base`; the resolved step's `preset` is cleared. `compile_stage` resolves every stage's preset into the cloned config it stores in `WorkflowProgram`, so all downstream reads see fully-merged stages. Most-specific (stage) wins.
- Scope: this is the preset→stage layer only. The global/project `.workhorse/config.toml` cascade layers (incl. project preset patches) are deferred to the bootstrap slice that owns config-file discovery.
- Tests: pipeline 28 (+2: stage_inherits_preset_with_explicit_fields_overriding, merge_step_prefers_over_then_base; pipeline gained `toml` dev-dep). Selfcheck `check_preset`. All struct-literal WorkflowConfig sites gained `presets: HashMap::new()`. Both clippy gates clean, fmt clean, icon-lint + selfcheck green.
- Next: genai streaming → wh facade/bootstrap (which will add the global/project config cascade layers).
- Gotcha: inserting a fn between an existing doc-comment and its fn silently reattaches the doc to the new fn — left compile_stage undocumented and tripped clippy's `# Errors` lint. Keep doc comments glued to their item.

## 2026-06-24 — persistence / crash-recovery (whole-run checkpoint)

- Landed: `runtime/src/persist.rs` — `RunStore` persists the WHOLE `WorkflowRun` (status + routing state + tokens + phase) as JSON to `$XDG_STATE_HOME/workhorse/workflow/<issue-id>/run.json` (`state_root()` via `dirs::state_dir`). `RunStore::for_issue(root, id)`, `persist(&run)`, `load() -> Option<WorkflowRun>` (corrupt/missing = None), `clear()`. Wired via `DriveOptions::with_persist(&store)`: the driver persists after EACH `stage_complete` (status-granularity). On restart: rebuild the program from frozen TOML, `store.load()`, resume. Persist failure is logged (eprintln) and non-fatal. We persist the whole run (not the spec's status-only) because WorkflowRun serializes cleanly — resume is exact, not approximate.
- Tests: runtime lib 34 (+3: persist roundtrip, load-absent, and an e2e `persisted_run_can_be_reloaded_and_resumed_after_a_crash` — run→park→persist→drop→load→resume to Done). Demo selfcheck `check_persist` (2 checks, offline). Both clippy gates clean, fmt clean, icon-lint pass.
- Next: preset inheritance + config cascade → genai streaming → wh facade/bootstrap.

## 2026-06-24 — cancellation token + DriveOptions bundle

- Landed: workflow cancellation. `DriveOptions<'a> { context: Option<ContextReader>, cancel: Option<&CancellationToken> }` (builders `with_context`/`with_cancel`, `Default`) bundles `run_with_limit`'s optional knobs — replaces the bare `context` param, so the signature stays at 7 args and future knobs have a home. The driver checks `opts.cancel.is_cancelled()` at each stage boundary (never mid-tool-call); on cancel it calls `run.cancel()` and returns `Outcome::Cancelled`. Uses `tokio_util::sync::CancellationToken` (already a runtime dep). `run_to_completion` passes `DriveOptions::default()`; `resume_workflow` takes `DriveOptions` too.
- Churn: mechanical update of ~11 call sites (runtime tests, main.rs ×4, orchestrator_panel ×4, selfcheck) from `Some(&reader)`/`None` to `DriveOptions::default().with_context(&reader)`/`DriveOptions::default()`. The demo panels pass no cancel yet (a Cancel button is a small follow-up UI).
- Tests: runtime lib 31 (+1 `cancel_token_stops_at_the_next_stage_boundary`: pre-cancelled token → Cancelled at first boundary). Both clippy gates clean, fmt clean, icon-lint + selfcheck green.
- Next: persistence/crash-recovery → preset inheritance → genai streaming → wh facade/bootstrap.

## 2026-06-24 — ask_parent: concurrent leaf + live parent answering (no deadlock)

- Landed: `ask_parent` for sub-agents (rust/runtime/src/subagent.rs). The leaf no longer runs blocking-to-completion inside `spawn_subagent`; instead the spawn tool drives the leaf future and an ask-channel in one `tokio::select!` loop. The leaf toolset gains an `ask_parent` tool whose handler sends `AskRequest { question, reply: oneshot }` over a `tokio::sync::mpsc` channel and awaits the answer. The select loop answers each question with one parent-model turn (`parent_answer` — a tool-free `Harness::run` seeded with the delegated task + question) and replies via the oneshot, then resumes; when the leaf finishes its output is the tool result. If the parent side drops the oneshot (gave up / over budget) the leaf's `ask_parent` returns an error result and continues — no deadlock.
- KEY: no `tokio::spawn` (that panics under the demo's `pollster` — no reactor). `tokio::select!` + tokio's sync channels are pure futures that work under any executor. The leaf future is `tokio::pin!`-ned and select'd directly; bind the harness + leaf_step + sink to `let`s so they outlive the borrowed future.
- Tests: runtime lib 30 (+1 `leaf_can_ask_parent_and_gets_an_answer`: shared mock serves leaf-ask -> parent-answer -> leaf-final in call order). Both clippy gates clean, fmt clean, icon-lint + selfcheck (subagent checks still green under pollster).
- Next: cancellation token -> persistence/crash-recovery -> preset inheritance -> genai streaming -> wh facade/bootstrap. (Semantic memory deferred — separate idea.)

## 2026-06-24 — sub-agents (MVP): spawn_subagent + permission ceilings + one-level-deep

- Landed:
  - **Config**: `SubAgentTemplate { name, model?, tools, write_globs }` (a permission *ceiling*) + `sub_agents: Vec<SubAgentTemplate>` on `StepConfig` (flattened into `StageConfig`).
  - **runtime/src/subagent.rs**: `spawn_subagent_tool(model, templates, leaf_tools, ctx, config) -> Arc<dyn Tool>`. On call: look up template by name; `resolve_permissions` validates the requested narrowing ⊆ the template's tool/glob ceiling (rejects escalation); build a fresh leaf `Harness` with ONLY the granted tools bridged in; run the task; return the leaf's final output as the tool result. **One level deep** is structural — the leaf toolset comes from `leaf_tools`, which never includes `spawn_subagent`. `ask_parent` + write-glob FS enforcement deferred.
  - **Crate graph**: promoted `tools` from a runtime DEV-dependency to a real native-gated dependency (`dep:tools` in the `native` feature), since runtime now owns a real tool. Sub-agents are core engine, so they live in runtime, not the demo.
  - **Demo**: selfcheck `check_subagent` — a one-stage `work` workflow whose mock parent calls `spawn_subagent` (leaf has its own mock model) then `increment_counter`, exits `count >= 1` -> done; asserts the leaf output (`found 3 modules`) returns to the parent as a `spawn_subagent` tool result and the run reaches Done. Live wiring into the interactive panel arms is deferred.
- Tests: runtime lib 29 (+7 sub-agent: 4 permission, spawn-runs-leaf, unknown-template, named-for-one-level); wh-demo selfcheck +2 sub-agent checks. Both clippy gates clean, fmt clean, icon-lint pass.
- Next: ask_parent (sub-agent pauses, routes to parent's live session, tool-timeout cancel-at-boundary) → cancellation token → persistence/crash-recovery → preset inheritance → L2 semantic memory.
- Gotchas: `MockCompletionModel::make` is an INHERENT method, so test modules using it do NOT need `use rig::completion::CompletionModel as _` (clippy flags it unused). `define_tool` needs a `&'static str` name/description — for a dynamic description (template list) `Box::leak` a formatted string. `ToolResult.output` is `Option<String>`.

## 2026-06-24 — doc resync + token-budget threading + orchestrator park & resume

- Landed:
  - **Doc resync**: README.md (stable toolchain not nightly, 88+2 test count, orchestrator status), this SESSION-LOG, and orchestrator.md (ticked steps 1–3, marked 4 partial) brought back in sync after the previous untracked session.
  - **Token-budget threading** (closes the flat-0 seam): the Harness already tracked real usage; now `HarnessEvent::Done.usage` carries the full stage cost — for the live-session epilogue boundary it folds the epilogue turn's usage back in via `add_usage` (that turn runs outside the `AgentRun`, so `run.usage()` alone misses it). Orchestrator `stage_tokens(events)` reads `Done.usage.total_tokens` and feeds `stage_complete`, replacing the `total_tokens()->0` stub. So the workflow token budget aggregates and `BudgetExceeded` can fire on real runs. Test `stage_tokens_reads_done_usage`.
  - **Orchestrator park & resume**: `ExternalEvent { updates }` (+ `ExternalEvent::with(k,v)`) models a webhook/sign-off; `resume_workflow(harness, program, run, task, max, context, event, tx)` calls `WorkflowRun::resume` (merge + re-eval the parked stage's guards) then `run_with_limit` — advances to Done if a guard now fires, re-parks otherwise. The caller owns the serialized `WorkflowRun` across the park, so it IS the resumable handle (no separate type). Tests: `parks_then_resumes_on_external_event_to_done`, `resume_with_unsatisfying_event_reparks`, selfcheck `check_resume` (`in_review → done` sign-off, offline).
- Tests: core 92 (+2 `#[ignore]`), wh-demo 2 + selfcheck (now incl. 2 resume checks). Both clippy gates clean, fmt clean, icon-lint pass.
- Next: sub-agents (`spawn_subagent` / `ask_parent`, one-level-deep) → then cancellation token, persistence/crash-recovery, preset inheritance, L2 semantic memory.
- Gotchas: rig `Usage` has more fields than the headline three — sum input/output/total and `..base` the rest. `resume_workflow` is 8 args (1 over pedantic): `#[allow(too_many_arguments)]` with reason rather than churn every `run_with_limit` caller for a bundle struct.

---

## 2026-06-24 — orchestrator end-to-end, deterministic-state routing, live-session epilogues, merged stage model

- Landed (one long session, many sub-arcs):
  - **Orchestrator** (`runtime/src/orchestrator.rs`): `run_to_completion` / `run_with_limit` compose `WorkflowRun` × Harness end to end; bundled `presets()` (`tiny`, `ralph-loop`) with `WorkflowPreset` + auto-seed; `Outcome::MaxIterations` graceful cap (`DEFAULT_MAX_STAGE_RUNS=24`).
  - **Deterministic state routing**: removed the `@state {…}` prose trailer entirely — the agent NEVER sets routing state. Tools publish `ToolResult.state`; the harness aggregates it into `HarnessEvent::Done.state`; the orchestrator feeds it to `stage_complete`. Tools OWN their keys via `Tool::produces()` (auto-seeded; `define_tool(...).produces(k,v).build()`), with `runtime::validate_state_keys` failing fast on an exit guard reading an unproduced/unseeded key.
  - **Stage-entry snapshot guards**: `WorkflowRun` snapshots state at stage entry; guards read `<key>@entry` (e.g. `count != count@entry` = "this stage changed count"). Parser allows `@` in identifiers.
  - **Live-session epilogue handoffs**: when a real (non-fallback) guard is satisfied after a tool batch, the Harness halts the agent at the boundary, asks the chosen exit's epilogue in the SAME session, and the agent's RESPONSE becomes the next stage's handoff (composed with context.md). `run_step` gained a `resolve_epilogue` callback; `WorkflowRun::resolve_pending_epilogue` previews the firing non-fallback exit.
  - **`builtin::always` → `builtin::paused`** (removed outright, no alias); `Expr::is_fallback()`.
  - **Config syntax**: `states` is now a name-keyed `IndexMap` with top-level `initial` (`[states.work]` + `[[states.work.exits]]`), and **steps removed entirely** — a stage IS its agent config (`StepConfig` flattened) + exits; looping is exit-driven; `preset` field kept for reuse (resolution not yet implemented).
  - **Memory channel**: `ContextService` (`services/src/context/`, context.md read/write) threaded into the orchestrator via a `ContextReader` closure; demo `CounterService` (`wh-demo/src/demo_counter.rs`) provides the deterministic `increment_counter`. Per-step tool filtering (`allowed_tool_names`) so `memory_weaver` is denied the counter.
  - **Real OAuth tool-calling**: `anthropic_direct.rs` now does real Anthropic content-block tool-calling (was prompt-blurb roleplay) incl. `normalize_input_schema` for zero-arg tools.
  - **Demo**: Orchestrator panel + drag-and-drop **Builder panel** (flowchart + bidirectional TOML). `--orchestrate[=preset]` headless runner.
- Tests: 88 core (+2 `#[ignore]` real-model) + 2 wh-demo, all green. Both clippy gates clean, fmt clean, icon-lint + offline selfcheck pass. Live `--orchestrate=ralph-loop` converges (one increment per `work` visit, looping through `memory_weaver`, epilogue responses carried forward).
- Next: token-budget threading (close the flat-0 seam) → orchestrator park & resume + external events (orchestrator.md step 3) → sub-agents.
- Gotchas: toolchain is **stable** (not nightly — README's nightly note is stale, being corrected). `--orchestrate=NAME` must match the `--orchestrate=` PREFIX (a bare `==` check falls through to the GUI and hangs headless). `define_tool` returns a `ToolBuilder` now — every call site must end in `.build()`. Seed numeric routing keys to `0` (not `false`) for `>=`/`!=` comparisons (memory #22).

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
