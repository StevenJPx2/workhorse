# AGENTS.md

Workhorse is an agent orchestrator for coding agents on Jira/GitHub issues. Active rewrite — check `plan/PROGRESS.md` for status.

## Commands

```bash
bun install                                 # Install dependencies
bun run check                               # Full: lint → typecheck → test → fallow (run before commits)
bun run build:all                           # Sequential build: core → plugins → tui (production)
bun run --filter workhorse-core test        # Test single package
bun run --filter workhorse-core test foo    # Test files matching "foo"
cd packages/core && bunx drizzle-kit generate  # Generate DB migrations
```

**Build order**: core → plugins (`bun run build:plugins`) → tui (`bun run build:tui` or `build:tui:prod`)

## Structure

```
packages/core/       # workhorse-core — main library
packages/plugins/    # External plugins (github, jira, pi-adapter, playwright)
packages/tui/        # Terminal UI (Ink-based)
oxlint/              # Custom lint rules (eslint-plugin-workhorse)
plan/                # Build plan — read XX-module.md for module context
```

**Entry points**: `packages/core/src/bootstrap.ts` (creates Workhorse), `packages/core/src/index.ts` (public API)

## Import Rules (oxlint-enforced)

Use path aliases from `packages/core/tsconfig.json`:

```typescript
import { SteeringRule } from "#workflow/steering"; // ✅
import { SteeringRule } from "../../workflow/steering/rule"; // ❌ deep relative
```

Import from module index only:

```typescript
import { SteeringRule } from "#workflow/steering"; // ✅
import { SteeringRule } from "#workflow/steering/rule"; // ❌ reaching into internals
```

No explicit `/index.ts` on subpaths:

```typescript
import { something } from "./types"; // ✅
import { something } from "./types/index.ts"; // ❌
```

## Code Constraints

| Rule                        | Limit                                | Enforced by                           |
| --------------------------- | ------------------------------------ | ------------------------------------- |
| Max file lines              | 200                                  | oxlint `workhorse/max-lines-per-file` |
| Coverage (lines, functions) | 97%                                  | vitest.config.ts                      |
| Coverage (branches)         | 95%                                  | vitest.config.ts                      |
| Filenames                   | kebab-case                           | oxlint                                |
| Test location               | Colocated (`foo.ts` + `foo.test.ts`) | oxlint                                |

## Rust port (`rust/`)

A from-scratch Rust rewrite on `rig`. Plan + rituals in `plan/rearchitecture/` (start at its
`README.md`). Use the pinned toolchain (Homebrew cargo shadows it):

```bash
export PATH="$HOME/.rustup/toolchains/nightly-2026-01-08-aarch64-apple-darwin/bin:$PATH"
cd rust && cargo test                                  # core workspace (51 tests)
cargo clippy --workspace --all-targets -- -D warnings  # lint gate — must be clean
cargo run -p wh-demo                                   # native egui smoke-test app
cargo run -p wh-demo -- --selfcheck                    # headless proof (CI-able)
```

### Enforced rules (do not regress)

| Rule | What | Enforced by |
| --- | --- | --- |
| **clippy pedantic** | `clippy::pedantic` is on workspace-wide. Fix lints; never lower the global level. Suppress one site with `#[allow(clippy::x)]` + a reason. | `[workspace.lints]` in `rust/Cargo.toml` + `[lints] workspace = true` per crate; `rust/wh-demo` has its own `[lints.clippy]` (separate workspace). CI gate: `cargo clippy --workspace --all-targets -- -D warnings` (run in `rust/` **and** `rust/wh-demo/`). |
| **Phosphor-only UI glyphs** | egui UI strings (icons, separators, arrows, dashes) use `egui_phosphor::regular::*` constants interpolated with `{}` — never literal non-ASCII chars, which tofu (□) once the Phosphor font merges. | `rust/wh-demo/tests/ui_icon_lint.rs` (runs in `cargo test`). |
| **Phosphor in both font families** | After `egui_phosphor::add_to_fonts` (Proportional only), also push `"phosphor"` into the **Monospace** family, or icons in `ui.monospace(...)` tofu. | convention — set up once in `wh-demo/src/main.rs`. |
| **Human-testable per slice** | Every slice adds/extends a `wh-demo` panel; keep `--selfcheck` green. | `plan/rearchitecture/demo.md`. |
| ≤ 200 lines per file | same as TS side | review |

## Database

SQLite via drizzle-orm. Schema in `packages/core/src/db/schema/`.

## Pre-commit

`simple-git-hooks` runs `oxfmt --write` and `oxlint` on staged `.ts/.tsx` files.

## Architecture

- **bootstrap()** — Creates `Workhorse` instance with config, db, hooks, memory, monitors, tracker, orchestrator, plugins
- **Context**: Use `useWorkhorse()` inside plugin setup to access services
- **Plugins**: `definePlugin({ manifest, setup, teardown })` — see `MIGRATION.md`
- **Hooks**: Event pub/sub via mitt (`hooks.on()`, `hooks.emit()`)
- **MemoryService**: L1 (context.md) + L2 (retriv semantic search)
- **MonitorService**: Polling framework for health checks
