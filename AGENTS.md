# AGENTS.md

Jiratown is an agent orchestrator that manages coding agents working on Jira/GitHub issues. This is an active rewrite.

## Build Plan

This repo is being built incrementally. Before starting work:

1. Check `plan/PROGRESS.md` for current status (steps 0–5 done, 6–12 pending)
2. Read the relevant `plan/XX-module.md` for the module you're working on
3. See `MIGRATION.md` for old → new architecture mapping

## Quick Start

```bash
bun install                    # Install dependencies
bun run check                  # Verify everything works
```

## Key Entry Points

- `packages/core/src/bootstrap.ts` — Main entry, creates `Jiratown` instance
- `packages/core/src/index.ts` — Public API exports
- Each module in `packages/core/src/*/` has a `README.md` explaining its purpose

## Runtime & Commands

Use **Bun** everywhere. All commands use `bun run <script>`.

```bash
bun run check      # Full audit: lint → typecheck → test → fallow (run before commits)
bun run lint       # oxlint
bun run typecheck  # tsc across workspaces
bun run test       # vitest across workspaces
bun run fallow     # Dead code, duplication, complexity analysis
```

Single-package commands:

```bash
bun run --filter @jiratown/core test   # Test one package
bun run --filter '*' typecheck         # All packages
```

## Project Structure

```
packages/core/     # Main package (@jiratown/core)
oxlint/            # Custom oxlint plugin (eslint-plugin-jiratown)
```

**Path aliases**: Use `#config`, `#types`, `#db`, `#plugins`, `#context`, `#lib/hooks`, `#workflow/steering`, etc. instead of relative imports within `packages/core/`. Defined in `packages/core/tsconfig.json` and mirrored in `vitest.config.ts`.

**Subpath import rule**: Always import from the module's index, not inner files. Each module should export everything needed from its `index.ts`.

```typescript
// ✅ Good - import from module index
import { SteeringService, type SteeringRule } from "#workflow/steering";
import { PromptEngineer } from "#workflow/tracker";

// ❌ Bad - reaching into module internals
import { SteeringService } from "#workflow/steering/service";
import { PromptEngineer } from "#workflow/tracker/engineer";
```

If you need something from a module that isn't exported, add it to the module's `index.ts` rather than using a deep path.

**Prefer direct paths over explicit `/index.ts`**: Let TypeScript resolve the index file automatically. This applies to both path aliases and relative imports with subpaths. Only keep explicit `/index.ts` for imports that point directly to the current or parent index file (i.e., `./index.ts`, `../index.ts`).

```typescript
// ✅ Good - no /index.ts suffix
import { SteeringService } from "#workflow/steering";
import { HookEmitter } from "#lib/hooks";
import { something } from "./types";
import { other } from "../utils";

// ❌ Bad - explicit /index.ts on subpaths
import { SteeringService } from "#workflow/steering/index.ts";
import { something } from "./types/index.ts";

// ✅ Good - keep explicit /index.ts only for direct index imports
import { other } from "./index.ts";
import { parent } from "../index.ts";
```

## Code Conventions

### File constraints (enforced by oxlint)

- **Max 200 lines per file** (`jiratown/max-lines-per-file`)
- **kebab-case filenames** (`jiratown/enforce-kebab-case-filenames`)
- **Colocated tests**: Test files must be next to implementation (`foo.ts` + `foo.test.ts`)
- **Colocated exports**: Prefer exporting from the same file, not barrel re-exports only

### Test requirements

- **97% coverage minimum** (lines, functions, branches) — enforced by `vitest.config.ts`
- **Every test file must have at least one `it.fails("TODO: ...")`** case documenting planned behavior
- Use `vitest` globals (`describe`, `it`, `expect`) — no imports needed

### Complexity limits (fallow)

- Max cyclomatic: 15
- Max cognitive: 12

### Barrel export hygiene (manual review)

When working with barrel files (`index.ts`), check that exports are actually needed externally:

- **Internal-only exports**: If a symbol exported from `module/index.ts` is only imported by files within `module/`, it shouldn't be exported from the barrel — it's an implementation detail
- **Re-export chains**: When symbol `X` is exported from `l1/index.ts` → re-exported by `memory/index.ts` → re-exported by `src/index.ts`, that's fine (external consumers can reach it)
- **Rule of thumb**: Only export from barrels what logically belongs to the module's public API

## Bun-Specific APIs

Prefer Bun builtins:

- `Bun.serve()` over express
- `bun:sqlite` over better-sqlite3 (note: core currently uses better-sqlite3 + drizzle)
- `Bun.file()` over `node:fs` read/write
- `Bun.$\`cmd\`` over execa
- Bun auto-loads `.env` — no dotenv

## Database

SQLite via drizzle-orm. Schema in `packages/core/src/db/schema/`.

```bash
cd packages/core && bunx drizzle-kit generate  # Generate migrations
```

## Pre-commit

`simple-git-hooks` + `lint-staged` runs `oxfmt --write` and `oxlint` on staged `.ts/.tsx` files.

## Architecture Notes

See `MIGRATION.md` for the full architecture reference. Key concepts:

- **bootstrap()** creates the `Jiratown` instance with config, db, hooks, plugins
- **Context system**: Use `useJiratown()` inside plugin setup to access hooks/config
- **Plugins**: Define with `definePlugin({ manifest, setup, teardown })`
- **Hooks**: Event-based pub/sub via mitt (`hooks.on()`, `hooks.emit()`)
