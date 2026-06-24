# Scripts service

`ScriptService` discovers reusable `.sh` scripts, contributes `run_script` + `write_script`
tools, and runs them. The first real (non-mock) service — the demo's Registry panel calls it
against a live scripts directory.

```rust
let sandbox = Arc::new(LocalSandbox::new());            // dev; WasiSandbox/VM in prod
let svc = ScriptService::new(cwd, home, sandbox);       // discovers <cwd>/.workhorse/scripts + <home>/…
let mut reg = Registry::new();
reg.register(svc);
let toolset = reg.build_toolset(&ctx).await;            // run_script + read_script + write_script
toolset.call("run_script", r#"{"name":"greet","positional":["world"]}"#).await
```

Verify with `cargo test -p services`.

## Layout

The `services` crate holds the `Service`/`Contribution` contract, the `Registry`, and the
built-in services. The leaf `tools` crate keeps only the tool primitives (`Tool`,
`ToolContext`, `define_tool`, `RigToolBridge`). `Service::setup` takes `self: Arc<Self>` so a
service hands its own `Arc` to the tool closures it builds.

```
services/src/
  service.rs              Service trait + Contribution
  registry.rs             Registry (fresh ToolSet per run)
  script/
    front_matter.rs       Script types + parse/serialize (#-commented YAML + raw body)
    discover.rs           <cwd|home>/.workhorse/scripts/*.sh, de-duped first-wins
    invoke.rs             resolve_invocation + render_help
    run.rs                builds a SandboxCommand and runs it via Arc<dyn Sandbox>
    service.rs            ScriptService + run/read/write_script tools
```

## Behavior

- **Discovery**: `.sh` files under `<cwd>/.workhorse/scripts` then `<home>/.workhorse/scripts`,
  de-duped first-wins by name so a project script shadows a global one. Invalid files are
  skipped, never error. (Skill-prefixed scripts wait for `SkillService`.)
- **Front-matter**: YAML metadata embedded as `#`-prefixed shell comments above the command
  body; a leading `#!` shebang is skipped; the whole raw file is retained as `command`.
- **`run_script`** (`{ help?, name?, options?, positional? }`): no name lists scripts;
  `help=true` prints usage; otherwise resolves args and runs the body. Unknown options and
  missing required args are tool errors.
- **`read_script`** (`{ name }`): returns the raw `.sh` source so it can be inspected before
  running.
- **`write_script`** (`{ name, command, description, args }`): serializes front-matter to
  `<cwd>/.workhorse/scripts/<name>.sh`, then refreshes. Re-using a name overwrites.
- **Execution — sandbox-mediated**: the service never spawns a process directly. It builds a
  `SandboxCommand` (`/bin/sh -c <body>`, the cwd preopened) and runs it through
  `Arc<dyn Sandbox>`. Options become env vars (uppercased, `-`→`_`); positionals are injected
  via a `set -- '…'` prefix so the script sees `$1`, `$2`. Exit 0 → ok; nonzero → error with
  stderr.

The `Sandbox` trait is the execution boundary. `LocalSandbox` (a cap-scoped real `/bin/sh`,
dev only) is the working default; production swaps in `WasiSandbox` (a `busybox`/`bash` `.wasm`
under a WASI preopen) or a VM-backed sandbox with no change to `ScriptService`.

## Steps

- [x] **1 — Front-matter** — `parse_front_matter`/`serialize_front_matter` round-trip;
  shebang skipped; parse failure keeps the raw body.
- [x] **2 — Discovery** — `discover_scripts(cwd, home)` reads `.sh` from both dirs, de-duped
  first-wins (cwd shadows home); missing dir yields empty; non-`.sh` ignored.
- [x] **3 — Invoke + help** — `resolve_invocation` errors on unknown option / missing
  required; optional positional defaults to empty; `render_help` formats usage.
- [x] **4 — Sandbox-mediated run** — builds a `SandboxCommand` and runs through
  `Arc<dyn Sandbox>`: positional via `set --`, options→env, exit-code mapping. `LocalSandbox`
  is the dev default.
- [x] **5 — Service + tools** — `ScriptService` (`Service` impl) contributes `run_script`,
  `read_script`, and `write_script`; `write_script` persists a real file, `read_script`
  returns its source, `run_script` executes it in the sandbox.

## Next services

`SkillService` (front-matter skills, skill-prefixed script discovery), `McpService`
(`rmcp` client, dynamic `mcp:<server>:<tool>` tools), `GitService`. As skills/ops/prompt
sections land, they attach to the same `Contribution` struct.
