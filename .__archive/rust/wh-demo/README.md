# wh-demo

A native [egui](https://github.com/emilk/egui)/eframe app that lets a human see and poke the
workhorse Rust port. It wires the **real** crates — no logic is mocked.

## Run

```bash
# from rust/
cargo run -p wh-demo            # opens a window
cargo run -p wh-demo -- --selfcheck   # headless smoke proof (CI-able, exits non-zero on failure)
```

It's a separate crate excluded from the core workspace, so `cargo test` stays fast and the
heavy egui deps don't touch the core build.

## Panels

- **when expr** — type a `when` guard → parsed `Expr` AST + the state keys it reads →
  evaluate against an editable JSON state map. (`pipeline`, spike C)
- **config → pipeline** — edit a snake_case workflow config (TOML) → compile → inspect each
  stage's `when`-guarded exits → run a stage's lowered `ValueOp` pipeline. (`pipeline`, spike C)
- **WorkflowRun** — hand-drive the sans-IO governor: `next_step` → `stage_complete` →
  **park** → `resume` → **done**, with the live serialized snapshot proving a parked run
  round-trips to JSON. (`runtime`, spike E)
- **Harness** — drive one step through the generic `Harness<M: CompletionModel>` against a
  mock or a real provider (Anthropic OAuth/key, OpenAI-compatible), streaming `HarnessEvent`s.
  (`runtime`)
- **Orchestrator** — the end-to-end loop: the `WorkflowRun` governor runs each stage's step
  through the `Harness`, and the model's trailing `@state { … }` line routes the next stage.
  Walks a whole workflow from `plan` to `done` (or park) on model output alone. Pick a bundled
  **preset** (`tiny`, `ralph-loop`) from the dropdown instead of hand-writing TOML. The
  `ralph-loop` preset is a self-driving loop: a `work` stage with a real exit plus a
  `builtin::paused` fallback to a `memory_weaver` stage that persists learnings to `context.md`
  (via the `ContextService` `write_context`/`read_context` tools) and routes back — so the agent
  keeps making progress across iterations instead of dead-stopping, bounded by a max-iterations
  guard. Headless: `cargo run -p wh-demo -- --orchestrate[=<preset>]`. (`runtime`, `services`)
- **Builder** — a visual workflow builder: a draggable flowchart of stage nodes with exit
  edges (add/drag/delete stages, drag a node's port to another to connect, edit a selected
  node's step + exits in the inspector) synced bidirectionally with an editable config (TOML)
  view. Seed from a preset, then `send to Orchestrator` to run it. Node positions are a view
  concern kept in panel state only; the config TOML stays coordinate-free. (`pipeline`)
- **Registry** — real services contribute tools; `ScriptService` discovers `.sh` scripts and
  runs them through the `Sandbox`. (`services`)

## The rule

Every new slice adds or extends a panel here so its behavior is human-testable. See
`plan/rearchitecture/demo.md`.

## Icons

All icons come from [egui-phosphor](https://github.com/amPerl/egui-phosphor) — the font is
installed in `main` via `egui_phosphor::add_to_fonts(.., Variant::Regular)`, and panels use
`egui_phosphor::regular::*` constants inline in labels/buttons (aliased `use
egui_phosphor::regular as icon;`). Don't hand-roll glyphs or pull in a second icon set.

Version pin: `egui-phosphor` tracks `egui`. This crate is on egui/eframe **0.34** with
egui-phosphor **0.12**. Bump all three together (egui-phosphor 0.12 ⇒ egui 0.34).

### Enforced

`tests/ui_icon_lint.rs` scans the egui panel sources and fails on any literal non-ASCII
glyph in UI code (arrows, dots, em-dashes, checkmarks). Those render as tofu (□) once the
Phosphor font is merged, so the rule is: icons and separators come from
`egui_phosphor::regular::*` constants (interpolated with `{}`), never as literal characters.
Full-line comments/docs are exempt. Runs in `cargo test`.

## Lints

Pedantic clippy is enforced (`[lints.clippy] pedantic` in `Cargo.toml`); CI gates with
`cargo clippy --all-targets -- -D warnings`.

## Note

This is native-only by design (the web/wasm target was dropped). The pure core
(`pipeline`, `runtime`'s `WorkflowRun`) was still made wasm-clean as a side benefit, so a web
surface remains possible later without rework.
