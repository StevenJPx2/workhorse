# Workhorse

> **Controllable, automated agents.**

Workhorse is an issue-driven coding-automation platform split into two halves: **`workhorsed`**, a long-lived Rust daemon that owns all state, supervision, and external watching; and a **TypeScript runner**, spawned per issue, that hosts [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) as the agent host and delegates workflow graphs, loops, and resumable runs to [pi-workflow](https://github.com/AgwaB/pi-workflow).

CortexKit plugins are assumed installed in the runner: [AFT](https://github.com/cortexkit/aft) (`@cortexkit/aft-pi`) provides the symbol-aware tool surface; [Magic Context](https://github.com/cortexkit/magic-context) (`@cortexkit/pi-magic-context`) provides self-managing context and cross-session project memory. Agent code execution is sandboxed in [Gondolin](https://github.com/earendil-works/gondolin) micro-VMs.

```
Jira / GitHub webhooks ──► workhorsed (Rust daemon — long-lived)
                            ├── SQLite: issues, runs, scripts, notifications, monitor state
                            ├── orchestrator: intake → worktree → spawn runner → park/resume
                            ├── monitor + notification frameworks (built-in monitors)
                            └── supervisor: crash detect, resume; TUI / headless frontends
                                     │
                                     │ stdio JSON-RPC (NDJSON) — THE contract
                                     ▼
                           runner (TS — per-issue, ephemeral)
                            ├── Pi (agent host: model transport, auth, agent loop)
                            ├── pi-workflow (artifact graph, loops, sub-agents, resumable runs)
                            ├── plugin SDK: hookable bus, tools, Pi adapter
                            ├── AFT + Magic Context
                            └── Gondolin micro-VM (tool/script execution, egress policy)
```

**The boundary lands on the natural seam: everything long-lived and stateful is Rust; everything that touches the model or the plugin ecosystem is TS.** A run is a subprocess the daemon can kill, restart, or resume without ceremony — crash isolation in both directions.

---

## What each layer owns

| Concern                                                                        | Owner                  |
| ------------------------------------------------------------------------------ | ---------------------- |
| Issue/run/script/notification persistence (SQLite)                             | `workhorsed` (Rust)    |
| Orchestration: intake → worktree → run → park → resume                         | `workhorsed`           |
| Monitor framework + built-in monitors (github-pr, jira-comments, agent-health) | `workhorsed`           |
| Notification store + stage-boundary inbox assembly                             | `workhorsed`           |
| Webhook listener (GitHub / Jira)                                               | `workhorsed`           |
| Worktree / git plumbing                                                        | `workhorsed`           |
| Script registry (DB-authoritative) + status gating                             | `workhorsed`           |
| Model transport + provider auth                                                | Pi (runner)            |
| Agent loop (`run` / `notify` / `interrupt`)                                    | Pi (runner)            |
| Workflow graph, loops, `until` routing, sub-agents, resumable runs             | pi-workflow (runner)   |
| Symbol-aware file tools, indexed search, code health                           | AFT (runner)           |
| Self-managing context / project memory                                         | Magic Context (runner) |
| Sandboxed execution, egress policy, secret injection                           | Gondolin (runner)      |
| Plugin SDK: hookable bus, tool contributions, Pi adapter                       | runner (TS)            |

Workhorse no longer builds a workflow engine. The former `when` language, exit compiler, and `WorkflowRun` governor are replaced wholesale by pi-workflow's artifact graph (`type: loop` + `until` conditions over control artifacts). The Rust port's workflow kernel is dead; its _infrastructure DNA_ (monitor hardening, config cascade, worktree plumbing) is donor material for the daemon.

---

## The IPC contract

The daemon⇄runner boundary is **JSON-RPC 2.0 over stdio, NDJSON-framed**. It is the load-bearing interface; everything versions against it.

- **Rust owns the message types.** Protocol messages are Rust enums/structs deriving `serde` + `ts-rs`; TS types and zod validators are generated into the runner package at build time. One source of truth, no hand-mirrored interfaces.
- **JSON, not protobuf/Cap'n Proto.** Traffic is tens of messages per run at stage-boundary frequency; payloads (artifacts, control blocks, issues) are natively JSON documents. Human-readable logs, replayable text fixtures, zero codec toolchain. The framing could change later without touching the contract, since the contract lives in Rust types, not the encoding.
- **Versioned envelope**; `#[serde(default)]` + optional fields for compatibility.

Core message families (illustrative):

| Direction       | Message                                          | Purpose                                                               |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| daemon → runner | `run.start`                                      | workflow spec, issue, worktree path, notification inbox               |
| runner → daemon | `run.event`                                      | stage transitions, artifacts, token usage — feeds TUI + DB            |
| runner → daemon | `run.complete`                                   | terminal artifact (e.g. prepare-pr output)                            |
| runner → daemon | `script.list` / `script.get` / `script.register` | script registry access                                                |
| daemon → runner | `notify`                                         | mid-run notification push (optional; inbox at start is the guarantee) |

### Hookable as the plugin-facing surface

The wire contract is not what plugins see. The runner carries the **hookable bus** proven in core v1/v2 (`hookable@6` + the `on` / `emit` (fire-and-forget) / `callHook` (awaitable) wrapper and deferred hooks for plugin-setup buffering — lift `packages/core/src/lib/hooks/` nearly verbatim, retyped).

A deliberately dumb **bridge** translates: incoming `run.start` → `callHook("run.starting", …)`; local stage events are `emit`ed and forwarded as JSON-RPC notifications. Two rules:

1. Rust owns wire types; TS is generated.
2. **Hook names ≠ wire names** — the bridge maps explicitly, so the plugin-facing vocabulary can evolve without breaking the versioned wire contract.

---

## Sandbox: Gondolin

The runner executes agent tool calls and scripts inside a [Gondolin](https://github.com/earendil-works/gondolin) micro-VM (QEMU; TS control plane; project worktree mounted at `/workspace`). The [Pi + Gondolin extension](https://github.com/earendil-works/gondolin/blob/main/host/examples/pi-gondolin.ts) is the integration reference.

What it buys:

- **Egress policy** — programmable HTTP/TLS allowlists; the agent reaches only sanctioned hosts.
- **Secret injection without guest exposure** — the guest sees placeholders; real tokens (GitHub, Jira) are injected host-side only toward allowlisted destinations. Exfiltration-resistant by construction.
- **Snapshots** — pair naturally with the `in_review` park: snapshot on park, resume warm (deps installed, caches hot) on wake-up. A v2 feature, not skeleton-critical.

This reframes **bashless**: the original doctrine removed bash because it was an ungoverned security surface. Bash _inside_ a policy-controlled micro-VM is governed — the hard security argument is now enforced by the VM boundary. Curated tools remain the default for token economy and observability, but the design no longer depends on tool absence for safety.

Caveats: Gondolin is experimental; requires QEMU; ARM64 is the most-tested path; first use pulls ~200MB of guest assets; VM boot adds per-run latency (fine at stage granularity, amortised by snapshots).

---

## Script capability: agent-authored tools

The unique property of scripts is **self-extension**: an agent authors a tool for itself at runtime, and that tool persists — across stages, runs, and sessions — under the same governance as any other capability.

**The registry is DB-authoritative.** No frontmatter, no directory scanning. Scripts live in the daemon's SQLite:

```sql
CREATE TABLE scripts (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  scope        TEXT NOT NULL,                 -- 'project' | 'global'
  project_id   INTEGER,                       -- NULL for global
  description  TEXT NOT NULL,
  command      TEXT NOT NULL,                 -- body only, no comment header
  args         TEXT NOT NULL DEFAULT '[]',    -- JSON: [{name, type, required, description}]
  status_gates TEXT NOT NULL DEFAULT '[]',    -- JSON: [] = all statuses
  created_by   TEXT NOT NULL,                 -- 'agent' | 'user' | 'seed'
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE(name, scope, project_id)
);
```

- **Registration is an explicit API** over IPC: `script.register` / `script.update` / `script.list` / `script.get`. The agent-facing `write_script` tool wraps `script.register`. Parameters are validated strictly at registration time — a bad `status_gates` value is a rejected registration, not an ignored comment line.
- **Listing reads the DB, period.** Stage capability assembly is one indexed query; gate evaluation runs on typed data.
- **Execution**: runner fetches `{command, args, gates}` from the daemon, gate-checks, runs the body in the Gondolin VM.
- **Seeding** keeps the clone-and-go story: a committed `.workhorse/scripts.toml` (declarative TOML — a team's `test` / `lint` / `build` commands) is imported into the DB at project registration with `created_by = 'seed'`. The DB remains sole runtime truth; the file is only an import source. Agent-authored scripts stay DB-only unless exported.

Status gates are the concrete capability-gating mechanism: a `test` script gated to `implementing` / `in_review` cannot be invoked during `plan`. Gate checks happen in the runner at tool boundaries against DB-typed data; a blocked call returns a structured error naming the allowed statuses.

---

## Monitors and notifications

Monitors are the daemon's eyes on the world outside the worktree. **The framework and the reference monitors are built into `workhorsed`** — third-party monitor plugins are deferred (revisit as declarative/generic monitors if ever needed).

### Framework (Rust, daemon-owned)

- **Polling monitors** — recursive tokio timers (next poll scheduled only after the previous completes); `hasChanges` → tick.
- **Event monitors** — webhook-driven push sources.
- **Hardening** — 5 consecutive errors → self-stop + `monitor.error`; success resets. Rate-limit pause strategies: `Retry-After` parsing, exponential backoff with jitter; paused monitors carry `resumesAt`.
- **Persistent dedup** — seen-IDs in SQLite, surviving restarts.
- Lifecycle events (`monitor.registered/tick/error/paused/resumed`) flow to frontends over the daemon's event stream.

### Built-in monitors

| Monitor         | Watches                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `github-pr`     | reviews (`CHANGES_REQUESTED` → high), comments (skipping Workhorse-generated), CI check transitions, mergeable state, merged/closed events |
| `jira-comments` | new human comments → notifications with reply metadata                                                                                     |
| `agent-health`  | runner liveness; a dead runner triggers supervisor recovery                                                                                |

### Two paths from the outside world

A monitor tick fans out along two deliberately separate paths — neither trusts agent prose:

- **Notification path — informs the agent.** Notification created (SQLite, `sourceId` dedup, priority), delivered as an inbox section when the daemon starts the next runner / next stage. Unaddressed notifications wait for the next inbox.
- **Control path — routes the work.** The monitor updates deterministic daemon state (checks status, open review threads, review settled). The daemon's orchestrator acts on it: wake a parked issue, start a follow-up run, force `done`. Within a run, pi-workflow's `until` conditions over control artifacts do the routing.

---

## Orchestrator and issue-driven autonomy

The daemon owns the full lifecycle:

1. **Intake** — webhook or command names an issue; a lightweight one-off runner fetches and structures it (Jira/GitHub MCP) → `Issue` record in SQLite.
2. **Worktree** — bare-repo model, worktrees as siblings; the daemon creates and owns them (`worktreePolicy: off` in pi-workflow — it never makes its own).
3. **Run** — daemon spawns a runner with `run.start` (spec, issue, worktree, inbox); collects `run.event` / `run.complete`; persists everything.
4. **Park** — a completed run leaves the issue in `in_review`. Parking is a daemon state, not an idling process: no runner exists while parked. Monitors watch; snapshots may hold the warm VM.
5. **Resume / done** — review activity → follow-up run (e.g. address-review) with the notification inbox as handoff; sign-off/merge → forced `done`. `done` is never agent-controlled.
6. **Crash recovery** — supervisor detects a dead runner and re-spawns using pi-workflow's `resumeRun` (failed/interrupted tasks reset to pending). Daemon restart recovers from SQLite.

---

## Workflow bundles

Workflows are **pure pi-workflow config** — JSON artifact-graph specs + agent markdown, shipped as presets and overridable per-project. The proven `implement-ticket` bundle:

- `plan` (single, read-only, `wh-planner`, `injectRuntimeTask`) → `implement` (loop, ≤6 rounds of `apply` + `self-review`, `until self-review.$.reviewStatus == "complete"`) → `prepare-pr` (single, read-only; Workhorse opens the actual PR from the artifact as a pre-transition step).
- Control schemas per stage keep machine-readable routing data (`<control>`) separate from narrative (`<analysis>`).
- Bashless tool defaults; write tools only where the stage needs them.

These live as `presets/` assets (with parse-validation tests), not as an npm package — they are config, not code.

---

## Products

**Moby** — Pi-style TUI for interactive workflow authoring and single-issue runs.
**Jiratown** — Jira-style TUI for bulk issue management; headless-capable because the daemon _is_ the supervisor.

Both consume the daemon's event stream (runs, stages, monitors, notifications) — never internals. The Rust daemon can host a ratatui TUI directly or serve frontends over a local socket.

---

## Toolchain

- **Daemon**: Rust workspace (stable toolchain, `unsafe_code = forbid`, clippy pedantic — the conventions proven in `rust/`). `rusqlite`, `tokio`, `axum` (webhooks), `ts-rs` (type generation).
- **Runner + plugin SDK**: [Vite+](https://viteplus.dev) (`vp`) monorepo in `core-v3/` — `vp check` / `vp test` / `vp pack`, same commands locally and in CI.

---

## Build order

1. **Pin the architecture** — this document. ✔
2. **IPC contract crate** — Rust message types + ts-rs generation into the runner package. The load-bearing artifact; everything versions against it.
3. **Walking skeleton** — minimal `workhorsed` spawns a minimal runner; executes the `implement-ticket` spec via pi-workflow; streams `run.event` back; persists the run in SQLite. Tools on bare host first; swap Gondolin in as the follow-up slice.
4. **Script capability** — DB registry, `script.*` IPC, `write_script`/`run_script` tools, TOML seeding, status gates.
5. **Monitor + notification frameworks** — scheduler, hardening, dedup, inbox assembly; first built-in monitor (github-pr).
6. **Autonomy loop** — webhook listener, `in_review` park, resume / forced `done`.
7. **Products** — Moby / Jiratown on the daemon event stream.
