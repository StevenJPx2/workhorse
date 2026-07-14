> **Archived reference.** This doc describes the standalone Rust runtime implementation. The current design is in [`workhorse-on-pi.md`](./workhorse-on-pi.md). Keep this as a record of proven design decisions (two-grain governor, deterministic state routing, sub-agent permission ceilings, park/resume mechanics) that informed the current approach.

# Rust Port — core-v2

> **Status:** plan / pre-implementation
> Decisions locked in the conversation that produced this doc. Update this file as each
> phase lands.

---

## What this is

A ground-up rewrite of `packages/core-v2/` in Rust, built **on `rig` as the substrate**.
The TypeScript implementation is the behavioral **reference** for the layers that already
exist (capability model, config, services); the runtime plane is unbuilt in TS and is
designed natively in Rust, using `rearchitecture.md` and `learnings.md` as its contract.

**Scope:** full — the capability model, the config plane, the service layer, and the
runtime plane.
**Audience:** public SDK; third-party authors write tools, services, and workflows.

---

## The thesis: rig is the substrate, applied recursively

`rig` is a full LLM-application framework, and it ships exactly the three primitives the
runtime needs:

1. **Dataflow** — `rig::pipeline`: typed, async, **acyclic** composition (`Op<In, Out>`
   with `chain` / `map` / `then` / `parallel!` / `conditional!` / `TryOp`).
2. **A sans-IO run machine** — `AgentRun`: a serializable, steppable state machine that
   owns the one genuinely _cyclic_ thing (the model↔tool loop), advanced by an external
   driver that performs all IO.
3. **Capabilities** — `ToolSet`, `Extractor`, RAG/vector stores, embeddings, evals, MCP
   client: the leaf operations a step invokes.

The design applies these at **two grains**. rig drives primitive (2) at the _agent_ grain;
workhorse drives the same pattern at the _workflow_ grain. A declarative config block
lowers to rig pipelines for its linear dataflow, and to a `WorkflowRun` governor for its
cross-stage routing and loops.

```
workhorse philosophy         two planes · stage/step/when · gating · Harness guarantees · services · sandbox · config
   │ expressed as
WorkflowRun (workflow grain)  sans-IO governor: when-routing · loops · budgets · cancel-at-boundary · suspend/resume
   │ whose steps are
rig Pipelines  +  Harness-governed AgentRun (agent grain)   dataflow ops + the model↔tool loop
   │ on
rig engine                   Agent · ToolSet · Extractors · RAG/vector · embeddings · evals · MCP
   │ on a
genai-backed CompletionModel / EmbeddingModel   25+ providers · opencode_go/copilot subs · AuthResolver / ServiceTargetResolver
   │
providers / subscriptions / CLI-only backends (process adapter)
```

### The recursive symmetry

The runtime is rig's own architecture, one grain up. `WorkflowRun` is built in the exact
shape of `AgentRun`:

|                  | `AgentRun` (rig — agent grain)              | `WorkflowRun` (runtime — workflow grain)             |
| ---------------- | ------------------------------------------- | ---------------------------------------------------- |
| The loop         | model ↔ tools                               | stage ↔ gate                                         |
| Step kinds       | `CallModel` / `CallTools` / `Done`          | `RunStage` / `Gate` / `Suspend` / `Done`             |
| Driver (does IO) | the Harness                                 | the Orchestrator                                     |
| Owns             | turn count, tool validation, usage, history | iteration count, `when` routing, budgets, park state |
| Sans-IO          | yes                                         | yes                                                  |
| Serializable     | yes — suspend/resume mid-run                | yes — **park = `in_review`**, resume on event        |
| Governs          | gating, truncation, cancel, token budget    | stage gating, workflow budget, cancel-at-boundary    |

A parked stage is a serialized `WorkflowRun` waiting on an external event — the same gift
`AgentRun` gives at the agent grain. The Harness drives `AgentRun`; the Orchestrator
drives `WorkflowRun`; both are governors over a sans-IO machine.

### What rig absorbs, what workhorse owns

rig absorbs the engine wholesale: model traits, `Agent` + `AgentRun` stepping, `ToolSet`,
extractors, RAG + vector stores (Qdrant, LanceDB, Mongo, Neo4j, SurrealDB, in-mem),
embeddings, **pipelines**, evals, loaders, observability, and the MCP client.

Four things rig does not provide; workhorse owns them, each defined by where it meets rig:

1. **Cyclic, governed control flow.** rig pipelines are acyclic — the `WorkflowRun`
   governor supplies loops, gates, budgets, cancel-at-boundary, and suspend/resume.
2. **Process / VM isolation.** The `Sandbox` trait wraps a tool before it becomes a
   `ToolSet` entry.
3. **A declarative config surface + SDK.** The config→pipeline compiler lowers snake_case
   config into rig pipelines and a `WorkflowRun` program.
4. **Capability-gating policy.** `(providers) ∩ step allowlist`, most-restrictive-wins,
   enforced at rig's tool-call boundary.

---

## Resolved design forks

- **Acceptance gate — clean-room native.** TS tests are a _reference_ for behavior, not a
  hard gate. Port or re-derive them as Rust tests where they add confidence; never block a
  phase on byte-for-byte parity.
- **Cyclic control — the `WorkflowRun` governor.** Cycles, gates, budgets, and
  cancel-at-boundary live in a sans-IO step machine mirroring rig's `AgentRun`; rig
  pipelines carry the acyclic dataflow inside each stage.
- **Crate granularity — four crates + facade:** `tools` / `pipeline` / `runtime`
  / `sandbox` + `wh` (with a `macros` proc-macro support crate).
- **Agent execution boundary — the sandbox.** The agent runs entirely inside a sandbox;
  every tool call, read/write, and command stays confined. Firecracker is the first
  microVM primary (Linux); WASI is the cross-platform/CI baseline; Apple `container`
  follows for macOS.
- **L2 memory — deferred to Phase 4+** (keep it a stub). Leading backend candidate:
  `cortex-mem` (rig-based) or a thin build on rig's vector stores.

---

## Capability model (tools)

### Keystone realization

Nearly every "how do I do this in Rust?" question traces to one TypeScript idiom: **a
capability _is_ its Zod schema, with the handler embedded inside it.**

```ts
// schema/tool/schema.ts — three roles in one object:
export const Tool = z.object({
  description: z.string(),
  execute: z.custom<ToolHandler>(...),   // ← behavior (non-serializable closure)
  input:   z.custom<z.ZodType>(...),     // ← a runtime type used for validation
  name:    z.string(),                   // ← plain data
});
// define.ts — args type inferred FROM the runtime schema:
export function defineTool<I extends z.ZodType>(spec: ToolT<I>) { ... }
//             execute(args: z.infer<I>, ctx)
```

Two TypeScript features make this work and **neither exists in Rust**: closures stored
inside serializable data, and a static type inferred from a runtime value. So in Rust,
**behavior and data live in separate layers.** Everything else cascades from that split.

### Two-layer split + the rig bridge

A generic _front door_ for authoring, an erased _storage form_, and a _bridge_ into rig's
`ToolSet`. Authors call `define_tool`; the args type drives the JSON Schema and everything
erases to `Arc<dyn Tool>`:

```rust
let search = define_tool(meta, |a: SearchArgs, ctx| async move {
    ctx.index.query(&a.q).await                       // returns ToolResult
});
let result = search.execute(json!({ "q": "rig" }), &ctx).await;   // uniform Value dispatch
```

Storage form is an object-safe `Tool` (`name` / `input_schema` / `execute(Value, ctx)`);
`Arc<dyn Tool>` gives heterogeneous storage and serves MCP's dynamic-schema tools (no Rust
compile-time type). The bridge registers each gated tool into a rig `ToolSet`:

```rust
let toolset: ToolSet = gated.iter().map(rig_tool).collect();   // wh::Tool → rig entry
```

**rig's own `Tool` trait is not object-safe** (associated types + `const NAME`); it erases
internally to `ToolDyn`, the seam the bridge attaches to. This bridge is load-bearing: rig
executes tools inside `AgentRun`, so every gated capability reaches the model through it.

A `#[tool]` proc-macro (in `macros`) is the sugar over `define_tool`, matching
`defineTool<I>` ergonomics.

### Two gotchas this forces

- `async fn` in an object-safe trait is not natively dyn-safe — use **`async-trait`**
  (boxes the future). Touches `Tool`, `Service`, and the adapter traits.
- A dyn-safe method cannot return `impl Stream` — the agent adapter returns
  `Pin<Box<dyn Stream<Item = AgentEvent> + Send>>`.

---

## Agent grain: rig's `AgentRun`, governed by the Harness

rig factors its agent loop into `AgentRun` — _"a sans-IO, steppable, serializable state
machine for the agent prompt loop"_ that _"owns every decision the agent loop makes — turn
counting, tool-call validation, invalid tool-call recovery, chat-history threading, usage
aggregation and final response construction — without performing any IO itself."_
`Agent::prompt` is rig's built-in driver; the machine is explicitly designed to be driven
by hand for custom control flow. **The Harness is that hand driver.**

The protocol: `next_step()` returns `AgentRunStep::{ CallModel, CallTools, Done }`; the
driver performs the IO and feeds results back via `model_response` / `tool_results`. The
run is `Serialize + Deserialize`, so it can suspend between steps and resume in another
process. Default multi-turn depth is `0` (one tool round-trip); raising it widens the
budget, and exceeding it surfaces `MaxTurnsError`. Invalid/unknown tool calls route
through recovery hooks (`Fail` / `Retry` / `Repair` / `Skip`).

```rust
// The Harness drives AgentRun; every guarantee lands on a step boundary.
let mut run = AgentRun::new(prompt).max_turns(budget.turns);
loop {
    if cancel.is_cancelled() { break; }                         // cancel at boundary
    match run.next_step()? {
        CallModel { prompt, history, turn } => {
            let req = build_request(prompt, history, &ctx);      // truncation + context injection
            let resp = model.complete(req).await?;               // genai-backed CompletionModel
            run.model_response(resp.into())?;
        }
        CallTools { calls } => {
            let results = gate_and_dispatch(&step_caps, calls, &ctx).await; // gating + result truncation
            run.tool_results(results)?;
        }
        Done(response) => { /* map → AgentEvent::Done */ break; }
    }
    if run.usage().total() > budget.tokens { cancel.cancel(); }  // token budget
}
```

| Harness guarantee                                   | Where it lands on `AgentRun`                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Gating**                                          | the `CallTools` step — each call passes the capability gate before dispatch (or rig's `Skip`/`Fail` recovery) |
| **Truncation / context injection / budget shaping** | the `CallModel` step — the Harness builds the actual request before sending                                   |
| **Cancel-at-boundary**                              | check the `CancellationToken` between `next_step()` calls; the in-flight tool finishes, the next never starts |
| **Token budget**                                    | `run.usage()` exposes running totals; overflow cancels at the next boundary                                   |
| **Concurrency**                                     | the driver chooses tool-execution concurrency; rig imposes none                                               |

### Transport + auth: genai under rig

`genai` (`jeremychone/rust-genai`, MIT) is the native-protocol multi-provider client —
chat, streaming, function-calling, vision across 25+ providers — and the breadth for
subscription auth. A single shim implements rig's `CompletionModel` + `EmbeddingModel` over
a genai `Client`, so every rig feature runs on genai's transport. Where a plain API key
suffices, rig's native provider needs no shim.

| Access mode                                       | Auth                                     | How                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Provider API key                                  | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, … | genai default                                                                                                                  |
| OpenCode Go / Copilot / Zai-coding subscription   | their tokens                             | genai built-in adapter (`opencode_go::`, `github_copilot::`, …)                                                                |
| OpenAI-compatible gateway / proxy                 | gateway token + URL                      | genai `ServiceTargetResolver` or `genai_<n>::`                                                                                 |
| Endpoint + injectable header (e.g. Claude bearer) | bearer / OAuth                           | genai `AuthResolver` / `with_reqwest` — ⚠️ ToS-grey, brittle                                                                   |
| CLI-only subscription (Claude Code / Codex login) | the CLI's own login                      | **process adapter** — drive `claude`/`codex` headless, parse stream → `AgentEvent`, hand it the gated toolset as an MCP server |

The first four ride a single `GenAiAdapter` behind rig; CLI-only is the only path that
bypasses rig + genai — used when a subscription has no targetable endpoint; interrupt
granularity is
coarser there.

### Adapter surface

```rust
// run an agent: a stream of AgentEvent that always ends in Done
let mut events = agent.run(prompt, step_tools, opts);
while let Some(ev) = events.next().await { /* map → TUI / observability */ }
agent.notify("review requested").await;   // append a message between turns
agent.interrupt();                         // boundary-only halt

// the event shape is the design:
pub enum AgentEvent {
    ToolCall { id: String, name: String, args: serde_json::Value },
    ToolResult { id: String, result: ToolResult },
    Message { content: String }, TokenUsage { input: u64, output: u64 },
    Idle, Done { reason: DoneReason }, Error { message: String },
}
pub enum DoneReason { Completed, Interrupted, Error }
```

The default `RigAgent` drives `AgentRun` over a genai-backed model and maps each step →
`AgentEvent`. Gating, truncation, and budget always stay in the Harness — the adapter is
only the model/turn driver.

---

## Config plane: a compiler to rig pipelines

The config plane is **a compiler that lowers snake_case config into rig pipelines plus a
`WorkflowRun` program.** Two front-ends, one IR:

- **First-party workflows** authored in Rust → a `macros` proc-macro / typed builder →
  statically-typed `Op<In, Out>` pipelines, fully type-checked.
- **Third-party config** (snake_case files — the public SDK surface) → a runtime
  interpreter → erased `Op<Value, Value>` pipelines. The Value-channel erasure is already
  how `wh::Tool` works, so the dynamic path is consistent end-to-end.

Both emit one `WorkflowProgram`: linear and branching dataflow compiles to actual rig
`Pipeline`s; cross-stage routing, gates, and loops compile to `WorkflowRun` nodes that
_invoke_ those pipelines and Harness-governed agent runs.

```rust
// pipeline — the lowering target
pub struct WorkflowProgram { pub stages: Vec<Stage>, pub entry: StageId }

pub struct Stage {
    pub id:        StageId,
    pub body:      StageBody,         // the acyclic work for this stage
    pub exits:     Vec<Exit>,         // when-guarded edges (routing, loops, park)
}

pub enum StageBody {
    Pipeline(ErasedPipeline),         // a rig Pipeline of service/transform/extract Ops
    Agent(AgentSpec),                 // a Harness-governed AgentRun (the cyclic leaf)
}

pub struct Exit { pub when: Expr, pub to: ExitTarget }   // ExitTarget: Stage(id) | Loop | Park | Done
```

### Pipeline combinators available

rig pipelines expose `chain` (compose), `map` / `then` (transform), `parallel!`
(concurrent fan-out), `conditional!` (dispatch on an input enum's variant), and `TryOp`
(fallible `and_then` / `or_else`). They are acyclic; iteration is supplied by `AgentRun`
(model↔tool) at the agent grain and by `WorkflowRun` (stage↔gate) at the workflow grain.

### Services and hooks are Ops

Each service/hook is a pipeline `Op` (or `TryOp`). A service's setup returns its tool and
skill contributions directly; the workflow accumulates them into the capability set — a
plain loop, no event fan-in needed for the common path.

- **Prompt-engineer step** — `parallel!`(service status, codebase intel, memory) → `then`
  merge → enhanced prompt.
- **Issue intake** — `chain(load).then(extract::<Issue>).then(validate)` → `Issue`.
- **Epilogue / handoff** — finishing response → `extract` a structured summary for the
  next stage.

### The `when` expression language

`when` guards are the edges the `WorkflowRun` evaluates against the live state map. The
grammar is a real ADT — load-time validation is exhaustive pattern-matching, plus a parse
error for unknown identifiers in user TOML.

```rust
// pipeline/src/when.rs
pub enum Expr {
    Builtin(BuiltinName),                              // todos_complete, token_budget_exceeded, …
    StateKey(StateKey),                               // git_clean (bare boolean)
    Comparison { key: StateKey, op: Op, value: ExprValue },
    FileExists(String),
    Matches { key: StateKey, pattern: String },
    And(Box<Expr>, Box<Expr>), Or(Box<Expr>, Box<Expr>), Not(Box<Expr>),
}
pub enum BuiltinName { TodosComplete, TokenBudgetExceeded, StepIdle, StatusChanged, ReviewSettled, Always }
pub enum StateKey    { GitClean, GitAhead, TodoCount, TokenUsed, IterationCount, Status, ChecksStatus, OpenReviewThreads }
pub enum Op          { Eq, Ne, Gt, Gte, Lt, Lte }
pub enum ExprValue   { Num(f64), Str(String), Bool(bool) }
```

Hand-rolled recursive descent is ~100 lines for this grammar; `winnow`/`chumsky` if it
grows. Cascade merge (`global → project → workflow → preset → step`) uses `figment` or
`Option`-field merging; snake_case is the Rust default, so "no case conversion" needs no
work.

---

## Workflow grain: the `WorkflowRun` governor

`WorkflowRun` is the runtime's core machine — built in `AgentRun`'s shape, one grain up.
It is sans-IO and serializable: it owns iteration counting, `when` routing, loop control,
budget aggregation, and cancel decisions, while the Orchestrator performs all IO
(running a stage's pipeline, driving a stage's agent through the Harness, evaluating
guards).

```rust
// runtime
pub enum WorkflowStep {
    RunStage { stage: StageId, input: Value },   // run a Pipeline, or an AgentRun via the Harness
    Gate     { exits: Vec<Exit> },               // evaluate when-guards → next target
    Suspend  { reason: ParkReason },             // park (e.g. in_review); persist + await event
    Done(WorkflowOutcome),
}
```

```rust
// The Orchestrator drives WorkflowRun — the same governing shape as the Harness loop.
let mut wf = WorkflowRun::resume_or_new(program, state);
loop {
    if cancel.is_cancelled() { break; }
    match wf.next_step()? {
        RunStage { stage, input } => {
            let out = run_stage(stage, input, &ctx).await;     // rig Pipeline or Harness-driven AgentRun
            wf.stage_result(out)?;
        }
        Gate { exits } => {
            let target = eval_when(&exits, wf.state());          // when-routing + loops
            wf.gate_result(target)?;
        }
        Suspend { reason } => { persist(&wf); return Parked(reason); }   // park = serialized run
        Done(outcome) => break,
    }
}
```

This makes the runtime's hard parts fall out of the machine: **loops** are `Exit`s
targeting an earlier stage; **retry-with-budget** is a loop whose guard reads
`iteration_count` and `token_used`; **park / `in_review`** is `Suspend` — serialize the
run and resume on an external event (`StatusChanged`, a webhook); **cancel-at-boundary**
is the top-of-loop token check. The Harness governs `AgentRun` inside a stage; the
Orchestrator governs `WorkflowRun` across stages.

### Ownership tree

```
Orchestrator
  └─ GlobalContext (owned)
       ├─ config:        ResolvedConfig
       ├─ dispatcher:    EventDispatcher          ← enum HookEvent, small registry
       └─ registries:    service_factories · adapter_factories · agent_definitions · workflow_programs

Workflow  (one per run; owns everything below)
  ├─ context:       WorkflowContext (Arc — shared with the Harness)
  ├─ services:      Vec<Box<dyn Service>>         ← instantiated from factories
  ├─ capabilities:  CapabilitySet                 ← Vec<Arc<dyn Tool>> + skills, collected via setup
  └─ run:           WorkflowRun                    ← the sans-IO governor over the WorkflowProgram

Harness  (one per stage that runs an agent)
  ├─ agent:         Box<dyn Agent>                ← RigAgent driving AgentRun (genai-backed)
  ├─ step_caps:     CapabilitySet                 ← workflow caps ∩ step allowlist
  └─ cancel:        CancellationToken
```

### Runtime events

```rust
pub enum HookEvent {
    McpRegister      { server: McpServerConfig },        // dynamic MCP server added at runtime
    StatusChanged    { new: Status },                    // external event (Jira/GitHub webhook)
    PluginStepInject { step: StageId, before: Status },  // plugin injects a stage
}
```

Setup-time contribution (tools, skills) is a direct return from `Service::setup`, not a
`HookEvent`. Only genuine runtime fan-out events go through the dispatcher
(`tokio::broadcast` where needed).

---

## Services & plugins

### Services — lifecycle capability providers

A **service** is a stateful unit with a `setup`/`teardown` lifecycle that contributes
capabilities to a run. rig has no service concept; everything a service produces lands in
rig structures — tools bridge into the `ToolSet`, ops into pipelines, skills into the
prompt. Implement `setup` to return a `Contribution`:

```rust
impl Service for ScriptService {
    async fn setup(&self, ctx: &Ctx) -> Result<Contribution> {
        Ok(Contribution::tools([self.write_tool(), self.run_tool()]))   // → rig ToolSet entries
    }
    async fn teardown(&self) { self.pool.stop().await; }                 // explicit async cleanup
}
```

```rust
// the Workflow collects every service's contribution into one capability set
for svc in &services { caps.extend(svc.setup(&ctx).await?); }   // tools · skills · ops · prompt sections
// gating narrows caps per step at the AgentRun boundary; teardown runs at end of run
```

A service owns state behind `Arc<Self>`, and its tools capture it to call back —
`write_script` holds `Arc<ScriptService>` and calls `self.refresh()` under an `RwLock`.
Contribution kinds: **tools** (ToolSet), **skills** and **prompt sections** (prompt), and
**ops** (named pipeline steps usable from config). Built-ins: `ScriptService` (sandboxed
exec), `SkillService` (front-matter skills), `McpService` (`rmcp`), `GitService`.

### Plugins — three lanes into one registry

A **plugin** is the distribution unit that registers contributions with the runtime
`Registry`. Three lanes mirror the compiler's compile-time / process / runtime split, all
converging on the same `ToolSet` + `WorkflowProgram`.

**Native (Rust crate)** — register services, ops, adapters, and hooks at startup:

```rust
impl Plugin for GithubPlugin {
    fn register(&self, r: &mut Registry) {
        r.service(GithubService::factory());          // issue/PR tools + skills
        r.op("classify_issue", classify_op());         // a pipeline Op usable in config stages
        r.adapter(MyBackend::factory());               // a new Agent backend
        r.on(HookEvent::StatusChanged, notify_op());   // react to a runtime event
    }
}
```

**Process (any language) — MCP.** rig's MCP client pulls an external server's tools into
the `ToolSet`; the same boundary runs in reverse, exposing workhorse's gated toolset to a
CLI agent as an MCP server. Declared in config:

```toml
[[mcp_servers]]
name = "github"
command = "github-mcp"      # McpService connects at setup; its tools gate like any other
```

**Declarative (config + skills + scripts)** — a directory the config→pipeline interpreter
loads: stages, skills, and scripts with no compilation.

Plugin : service :: package : module — a plugin bundles services (plus ops, adapters,
hooks); a service is one runtime lifecycle unit. The `Registry` stores _factories_, so each
run instantiates a fresh service set (the ownership tree above).

---

## Sandbox — the agent's execution boundary

Every tool call, read/write, and command stays inside the sandbox. The agent never
escapes its worktree. The runtime selects an implementation from platform + config.

A `Sandbox` exposes `exec` plus optional warm `start`/`stop` for pooled VMs:

```rust
let out = sandbox.exec(SandboxExec {
    command: script.body, args, env, root: worktree, timeout,
}).await?;                                  // → SandboxOutput { exit_code, stdout, stderr }
```

| Impl                                        | Mechanism                                                                                                                                                                                | Isolation                                       | Platforms                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| **`FirecrackerSandbox`** (Linux primary)    | microVM via Firecracker; configure over **REST-API-over-UDS**, worktree as a block device (or virtio-fs), minimal kernel + rootfs, script via an init/agent over **vsock**; add `jailer` | **Strong** — hardware-virtualized               | Linux + KVM (`/dev/kvm`)           |
| **`AppleContainerSandbox`** (macOS primary) | shell out to `container run --rm -v <root>:/work …`                                                                                                                                      | **Strong** — lightweight Linux VM per container | macOS 26+, Apple Silicon; CLI-only |
| **`WasiSandbox`** (cross-platform fallback) | `wasmtime` + WASI preopened dir; a `bash`/`busybox`.wasm                                                                                                                                 | Strong (preopen = only visible FS)              | cross-platform, in-process         |
| **`DockerSandbox`** / `PodmanSandbox`       | OCI runtime, bind-mount the worktree                                                                                                                                                     | Namespace-level                                 | Linux, CI, Intel Mac               |
| **`LocalSandbox`** (dev only)               | `cap-std`-scoped real shell                                                                                                                                                              | Weak                                            | all; explicit opt-in               |

Firecracker is Rust + API-over-UDS, so it is **drivable in-process** (no shell-out);
Apple `container` is CLI-only and shells out. Both microVM primaries are platform-locked,
so the runtime picks per host and falls back to WASI (CI) or Docker/Podman (Intel Mac).
Build `WasiSandbox` first — testable in CI with no external daemon.

---

## TypeScript → Rust (assumptions that change)

Grounded in `packages/core-v2/src/`.

| #   | TS assumption                                                                                      | What changes in Rust                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema = runtime validation = the type boundary (`z.object`/`.parse`/`.infer`; `Foo`+`FooT` pairs) | Rust types are real → validation collapses to **edges only** (TOML parse, LLM tool-arg JSON). The `Foo`/`FooT` duplication becomes one struct; most `.parse()` calls vanish. |
| 2   | Closure stored as data (`z.custom<ToolHandler>`, `Skill.render`, `Script.run`)                     | Behavior cannot live in a `serde` struct → trait method or `Arc<dyn Fn>` field (not derived).                                                                                |
| 3   | Type inferred from a runtime schema (`defineTool<I>`)                                              | The two-layer split: generic `define_tool<A>` erases to `Arc<dyn Tool>` with `Value` args at dispatch.                                                                       |
| 4   | Structural typing (`interface Service`, string-keyed `Hooks`)                                      | Nominal `trait`s + bounds; the `Hooks` map becomes `enum HookEvent`.                                                                                                         |
| 5   | Freely shared mutable state across `await`                                                         | `tokio` is multi-threaded → anything crossing `.await` is `Send + Sync`; shared fields → `Arc<RwLock<…>>`.                                                                   |
| 6   | GC'd reference graph (`GlobalContext` everywhere, service↔hook cycles)                             | Explicit ownership tree; break cycles with `Weak`.                                                                                                                           |
| 7   | Exceptions (`throw`, Zod `.parse` throws)                                                          | `Result<T, E>` + `?` + `thiserror`; `ToolResult` promotes to a result-shaped enum at the boundary.                                                                           |
| 8   | `any`/`unknown`/`as` at dynamic edges                                                              | `serde_json::Value` + typed deserialization, or an enum.                                                                                                                     |
| 9   | Dynamic JSON Schema → static type (`z.fromJSONSchema(mcpTool.inputSchema)`)                        | MCP tools stay `Value`-typed, validated at runtime via the `jsonschema` crate — reinforcing the object-safe trait.                                                           |
| 10  | `teardown()` fire-and-forget (`void client.close()`)                                               | `Drop` is sync; keep explicit `async fn teardown`.                                                                                                                           |
| 11  | Heterogeneous arrays (`AnyTool[]`)                                                                 | `Vec<Arc<dyn Tool>>` — forces object-safety.                                                                                                                                 |
| 12  | Node APIs (`process.cwd()`, sync `mkdirSync`)                                                      | `std::env`, `dirs`, `tokio::fs`; `spawn_blocking` for sync-only libs.                                                                                                        |
| 13  | `just-bash` in-process virtual FS                                                                  | The `Sandbox` trait — agent execution boundary (WASI preopen / microVM). Every tool call stays inside.                                                                       |
| 14  | `async function*` streaming (`Agent.run()`)                                                        | `Stream` + `async-stream`; `AgentEvent` is a clean `enum`.                                                                                                                   |
| 15  | Zod projection schemas (`.pick`/`.partial`)                                                        | Distinct structs + `From`/`Into`.                                                                                                                                            |
| 16  | Cascade merge via `defu`                                                                           | `figment` or manual `Option`-field merge.                                                                                                                                    |
| 17  | snake_case config as an explicit rule                                                              | The Rust default — the rule disappears.                                                                                                                                      |
| 18  | kebab-case `.ts`, barrel `index.ts`, subpath imports                                               | snake_case `.rs`, `mod`/`pub use`, crate paths.                                                                                                                              |

---

## Idiomatic Rust wins

| Area                | TS today                                           | Rust advantage                                                                        |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `when` language     | string DSL, loose runtime checks                   | `enum Expr { … }` ADT + parser + exhaustive load-time validation                      |
| `AgentEvent` stream | string-discriminated variants                      | clean `enum`, exhaustive match                                                        |
| `Status`            | `z.enum([…])` runtime strings                      | `#[derive(Serialize, Deserialize)] enum Status` — compile-time exhaustiveness         |
| Interrupt / notify  | mutate a live session (safe only single-threaded)  | `CancellationToken` (boundary-checked) + `mpsc` — race-free                           |
| Config validation   | parser + runtime checks mixed                      | `serde` derive + typed validation; errors at parse time                               |
| Park states         | `in_review` parks implicitly (stage loops forever) | `WorkflowRun::Suspend` — a serialized run awaiting an event                           |
| Suspend / resume    | not expressible                                    | `AgentRun` and `WorkflowRun` are both `Serialize` — persist mid-run, resume elsewhere |

---

## Workspace layout

One Cargo workspace; every crate defined by its relationship to rig.

```
tools     capability model — Tool/Skill/Script/Service contracts + define_* front doors + the rig ToolSet bridge;
             shared types: Status, ToolResult, AgentEvent, Contribution, WorkflowContext, Agent trait
pipeline  config→pipeline compiler (interpreter + builder) · WorkflowProgram IR · when AST/parser/eval ·
             cascade merge · built-in services (Script/Skill/Mcp/Git) + their Ops
runtime   WorkflowRun governor · Orchestrator · Harness (drives AgentRun) · Registry + Plugin lanes · RigAgent / process adapters
sandbox   Sandbox trait + impls (Firecracker [Linux] / Apple container [macOS] / WASI / Docker / local)
wh           public SDK facade (re-exports + the #[tool]/workflow proc-macros from macros)
```

Dependency DAG: `tools` (leaf) ← `pipeline`, `sandbox` ← `runtime` ← `wh`.
`macros` is the proc-macro support crate (`syn` + `quote`), re-exported by `wh`.

| Rust crate | TS source                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------ |
| `tools`    | `schema/`                                                                                  |
| `pipeline` | `config/` + `services/` (services become Ops)                                              |
| `runtime`  | `orchestrator/`, `workflow/` (+ the unbuilt runtime; LLM via `rig`)                        |
| `sandbox`  | `Sandbox` trait — agent execution boundary (Firecracker / Apple container / WASI / Docker) |
| `wh`       | `src/index.ts` (facade)                                                                    |

---

## Build order

Clean-room native build — each phase consults its TS counterpart for behavior.

### Phase 0 — keystone spike

One vertical slice: `ToolResult` → `Tool` trait → `define_tool` generic-to-erased bridge →
**`wh::Tool` → rig `ToolSet` entry** → `Service` trait → explicit collection → `run_script`
as a real tool, with the handler calling back into a shared `Arc<ScriptService>`
(`RwLock<Vec<Script>>` + `refresh()`). Prove `async-trait` + `Arc<dyn Tool>` + the generic
front door + the rig bridge compose before going wider. **TS reference:**
`schema/tool/define.test.ts`, `services/__tests__/script-service.test.ts`. Do not proceed
until it compiles and behaves like the reference.

### Phase 1 — `tools`

`ToolResult`, the `Tool` trait (`async-trait`), `define_tool` + `ToolMeta`, the rig
`ToolSet` bridge; `Skill` (render = `Option<Arc<dyn Fn>>`), `Script` (projection structs +
`From`), `Status`, `AgentEvent`, the `Agent` trait, `WorkflowContext`. **TS reference:**
`schema/**/__tests__`.

### Phase 2 — `pipeline`

snake_case serde config structs; TOML loader (`toml`); cascade merge (`figment`); the
`when` AST + parser + evaluator; the `WorkflowProgram` IR; the config→pipeline compiler
(runtime interpreter first, then the typed builder); the built-in services and their Ops.
**TS reference:** `config/loader.test.ts`, `services/__tests__/*`.

### Phase 3 — `sandbox`

The `Sandbox` trait + `WasiSandbox` (first), then `FirecrackerSandbox`; wire script tools
to an injected `Arc<dyn Sandbox>`. `McpService` via `rmcp` (dynamic schema stays `Value`;
explicit async teardown). **TS reference:** `services/__tests__/script-service.test.ts`.

### Phase 4 — `runtime` (native design)

The runtime is unbuilt in TS — Rust is the reference. Build `WorkflowRun` (sans-IO,
serializable), the Orchestrator driver, the Harness driving `AgentRun`, the `Registry` + plugin lanes, and the `RigAgent` /
process adapters. L2 memory remains a stub.

---

## Dependency map

| Need                                                              | TS today                                        | Rust                                                                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Schema validation                                                 | `zod`                                           | `serde` + `schemars` + `jsonschema` (edge validation)                                                                                |
| LLM engine (agent loop, tools, extractors, RAG, evals, pipelines) | (n/a)                                           | **`rig`** — `AgentRun` governed by the Harness; pipelines are the config target                                                      |
| LLM transport + auth (under rig)                                  | (n/a)                                           | **`genai`** backing rig's model traits (`opencode_go`/`github_copilot`; `AuthResolver`/`ServiceTargetResolver`); CLI process adapter |
| Workflow control flow                                             | (unbuilt)                                       | **`WorkflowRun`** sans-IO governor (mirrors `AgentRun`)                                                                              |
| Embeddings / vector store (L2)                                    | (TS L2 via retriv)                              | **Phase 4+, deferred** — rig vector stores or `cortex-mem` (rig-based; Qdrant, L0/L1/L2, MCP)                                        |
| Agent execution boundary                                          | (n/a)                                           | **`Sandbox` trait** — Firecracker (Linux) / Apple container (macOS) / WASI / Docker                                                  |
| Event bus                                                         | `hookable`                                      | explicit collection + `enum HookEvent` + `tokio::broadcast`                                                                          |
| TOML / front-matter                                               | `smol-toml` / `gray-matter`                     | `toml` / `gray_matter`                                                                                                               |
| Config cascade                                                    | `defu`                                          | `figment` or manual `Option` merge                                                                                                   |
| MCP protocol                                                      | `@modelcontextprotocol/sdk`                     | `rmcp` (aligns with rig)                                                                                                             |
| Async / streaming / cancel                                        | Node loop / `AsyncIterable` / `AbortController` | `tokio` / `futures::Stream` + `async-stream` / `tokio-util::CancellationToken`                                                       |
| Errors / tests / coverage / lint                                  | `throw` / `vitest` / `v8` / `oxlint`            | `thiserror`+`anyhow` / `cargo test`+`tokio::test` / `cargo-llvm-cov` / `clippy`                                                      |
| Proc-macros (`#[tool]`, workflow)                                 | `defineTool<I>`                                 | `macros` (`syn` + `quote`)                                                                                                           |

---

## Spikes before committing breadth

Each timebox-able to 1–2 days; a failed spike means the decision needs revisiting.

### Spike A — `Tool` model + rig `ToolSet` bridge (Phase 0)

`define_tool<A, F>` compiles, erases to `Arc<dyn Tool>`, dispatches, and the handler calls
back into a shared service. **Then the bridge:** wrap an `Arc<dyn wh::Tool>` as a rig tool
(JSON schema → `ToolDefinition`; `call(json)` → `execute(Value, ctx)`) and register it in a
`ToolSet`. Port `define.test.ts` as a Rust integration test.

### Spike B — `Sandbox` trait + a microVM primary (Phase 3)

Same `sandbox.exec(...)` produces identical `SandboxOutput` under **`WasiSandbox`** (build
first — `wasmtime` + WASI preopen, runnable in CI) and **`FirecrackerSandbox`** (Linux;
REST-over-UDS, worktree as block device, init/agent over vsock, `/dev/kvm`; validate warm
pooling) for a script allowed inside the worktree and denied outside it. Capture the
Firecracker API call sequence + guest-image recipe; add the Apple `container` contract when
that impl lands.

### Spike C — config→pipeline compiler + `when` (Phase 2)

A snake_case config stage lowers to a runnable rig `Pipeline` (interpreter path, erased
`Op<Value, Value>`), and `when` guards round-trip `Expr` AST → string → evaluator against a
sample state map. Cover every atom (`Builtin`, `StateKey`, `Comparison`, `FileExists`,
`Matches`) + `and`/`or`/`not`; verify load-time rejection of unknown names.

### Spike D — Harness drives `AgentRun`, on genai (Phase 4)

The agent-grain governance spike. A `RigAgent` where rig's `CompletionModel` /
`EmbeddingModel` run over a genai `Client` against **(a)** an API-key provider and **(b)**
an `opencode_go::` / gateway target; the **Harness hand-drives `AgentRun`** and enforces
all four guarantees at the step boundary — gate the `ToolSet` to one bridged `wh::Tool`,
truncate its result, cancel-at-boundary via `CancellationToken`, stop on token budget — and
maps the step sequence → `AgentEvent` ending in `Done`. Fallback if a provider can't host
the protocol: the Harness drives genai directly while still using rig for extractors / RAG
/ evals; note which providers forced it.

### Spike E — `WorkflowRun` governor (Phase 4)

The workflow-grain governance spike. A sans-IO `WorkflowRun` drives a two-stage program
with a `when`-guarded loop (stage B loops back to stage A until a guard reads
`iteration_count`), **suspends at a park** (serialize the run), and **resumes** from the
serialized state on a `StatusChanged` event to completion. Prove cancel-at-boundary and
workflow token-budget aggregation across stages.

---

## Conventions (Rust-side)

| TS convention                    | Rust equivalent                                                                                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kebab-case filenames             | snake_case `.rs`                                                                                                                                                                                                                    |
| "one word where possible"        | same (`context.rs`, `harness.rs`)                                                                                                                                                                                                   |
| colocated `foo.test.ts`          | `#[cfg(test)] mod tests` in `foo.rs`; `tests/` for integration                                                                                                                                                                      |
| 97% line/fn, 95% branch coverage | `cargo-llvm-cov --fail-under-lines 97`                                                                                                                                                                                              |
| ≤ 200 lines per file             | same; review or a `clippy` lint                                                                                                                                                                                                     |
| Zod `Foo` const + `FooT` type    | one `struct`/`enum Foo`                                                                                                                                                                                                             |
| snake_case config fields         | the Rust default; no `#[serde(rename)]`                                                                                                                                                                                             |
| `aube run check`                 | `cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace && cargo-llvm-cov`                                                                                                                                 |
| lint strictness                  | **`clippy::pedantic` enforced** workspace-wide via `[workspace.lints]` (and in `wh-demo`); CI gates with `-D warnings`. Suppress a specific lint locally with `#[allow(clippy::x)]` + a reason, never by lowering the global level. |
| smoke scripts                    | `rust/wh-demo/` — a native egui app; **each slice adds/extends a panel** (see `demo.md`)                                                                                                                                            |
| `aube run generate service`      | `cargo generate` template or `xtask generate`                                                                                                                                                                                       |

**Demo rule:** every slice ships a human-testable proof in `rust/wh-demo/` (native egui).
A slice is not done until a human can poke its behavior in a panel. See `demo.md`.

---

## Open questions inherited from `learnings.md`

Unresolved in the TS design too; they land in `runtime` (Phase 4), not before.

- **TUI integration** — an external TUI observes `AgentEvent` across stages, likely via
  `tokio::broadcast` from the Harness, subscribed per step.
- **Steering rules** — survive in core-v2, or fold into `when` exits over the same
  `StateKey` map?
- **Multi-workflow coordination** — the Orchestrator owns a `WorkflowQueue`; resource
  contention (same repo, different branches) needs a locking strategy.
- **L2 memory** — deferred to Phase 4+; an `L2Service` contributes a prompt section.
  Leading candidate `cortex-mem` (Rust, on rig-core, L0/L1/L2 tiers, Qdrant + filesystem,
  MCP server, forgetting curve). Adopt-as-library vs. run-as-sidecar vs. a thin build on
  rig's embeddings/vector stores is the Phase-4 call. ⚠️ Terminology clash: workhorse
  L1/L2 = working-memory compaction vs. semantic store, whereas cortex-mem L0/L1/L2 =
  abstraction tiers of one memory.
