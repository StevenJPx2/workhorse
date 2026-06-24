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
