# Registry & services

Services contribute capabilities; the Registry builds a fresh `ToolSet` for each run from those
contributions, bridged into rig.

```rust
let mut reg = Registry::new();
reg.register(Arc::new(GitService::default()));
let toolset = reg.build_toolset(&ctx).await;   // fresh per run, bridged into rig
```

Steps are **idempotent**: each names an end-state contract plus its test. Verify with
`cargo test -p tools` (or the crate the Registry lands in).

## Steps

- [x] **1 — Service contract** (`Service` + `Contribution`)
  `Service::setup(&ctx) -> Contribution` and `Service::teardown(&ctx)`; `Contribution { tools:
  Vec<Arc<dyn Tool>> }`. State lives behind `Arc<Self>`; a tool captures the service to call back.
  A sample service returns one tool whose handler reads service state. Test: `setup` yields the tool
  and the tool's call reflects that state.

- [x] **2 — Registry collects contributions**
  `Registry::register(Arc<dyn Service>)` stores services; `build_toolset(&ctx)` runs each `setup`,
  bridges every contributed `Arc<dyn Tool>` through `RigToolBridge`, and returns a `ToolSet`. Test:
  a registered service's tool dispatches by name through the built `ToolSet`.

- [x] **3 — Fresh set per run**
  `build_toolset` called twice yields independent `ToolSet`s — the Registry stores factories/services,
  not a shared set. Test: two builds, the tool's captured value reflects the setup invocation count
  at build time (each build increments the counter).

- [x] **4 — Teardown**
  Ending a run calls `teardown` on each service. Test: a service records teardown; it fires exactly
  once per run.

## Contracts

A `Contribution` carries tools now; skills, prompt sections, and ops attach to the same struct as
those land. The Registry is the one place that turns capability providers into a rig `ToolSet`, so the
`wh::Tool → ToolDyn` bridge stays the single adaptation point.

The `Service`/`Contribution` contract and `Registry` live in the `services` crate alongside the
built-in services; the leaf `tools` crate holds only the tool primitives. `Service::setup` takes
`self: Arc<Self>` so a service hands its own `Arc` to the tool closures it builds. The first real
service is `ScriptService` — see `scripts.md`.
