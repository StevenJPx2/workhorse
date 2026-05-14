# AGENTS.md

Workhorse is an agent orchestrator for coding agents on Jira/GitHub issues. Active rewrite — check `plan/PROGRESS.md` for status.

## Commands

```bash
bun install                                 # Install dependencies
bun run check                               # Full: lint → typecheck → test → fallow (run before commits)
bun run --filter workhorse-core test        # Test single package
bun run --filter workhorse-core test foo    # Test files matching "foo"
cd packages/core && bunx drizzle-kit generate  # Generate DB migrations
```

**CI build order**: oxlint plugin → core → plugins (`bun run build:plugins`) → tui (`bun run build:tui`)

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
import { SteeringRule } from "#workflow/steering";   // ✅
import { SteeringRule } from "../../workflow/steering/rule";  // ❌ deep relative
```

Import from module index only:
```typescript
import { SteeringRule } from "#workflow/steering";   // ✅
import { SteeringRule } from "#workflow/steering/rule";  // ❌ reaching into internals
```

No explicit `/index.ts` on subpaths:
```typescript
import { something } from "./types";        // ✅
import { something } from "./types/index.ts";  // ❌
```

## Code Constraints

| Rule | Limit | Enforced by |
|------|-------|-------------|
| Max file lines | 200 | oxlint `workhorse/max-lines-per-file` |
| Coverage (lines, functions) | 97% | vitest.config.ts |
| Coverage (branches) | 95% | vitest.config.ts |
| Filenames | kebab-case | oxlint |
| Test location | Colocated (`foo.ts` + `foo.test.ts`) | oxlint |

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
