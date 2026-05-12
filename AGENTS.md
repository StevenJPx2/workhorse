# AGENTS.md

Workhorse is an agent orchestrator managing coding agents on Jira/GitHub issues. Active rewrite — check `plan/PROGRESS.md` for current status.

## Quick Reference

```bash
bun install                    # Install dependencies
bun run check                  # Full audit: lint → typecheck → test → fallow (run before commits)
bun run --filter workhorse-core test   # Test single package
```

## Project Structure

```
packages/core/     # Main package (workhorse-core) — bootstrap, config, plugins, services
packages/plugins/  # External plugins (github, jira, pi-adapter)
oxlint/            # Custom lint rules (eslint-plugin-workhorse)
plan/              # Build plan docs — read XX-module.md for context on each module
```

**Entry points**:
- `packages/core/src/bootstrap.ts` — Creates `Workhorse` instance
- `packages/core/src/index.ts` — Public API exports

## Import Rules (enforced by oxlint)

**Use path aliases** — defined in `packages/core/tsconfig.json`:
```typescript
// ✅ Good
import { SteeringRule } from "#workflow/steering";
import { HookEmitter } from "#lib/hooks";

// ❌ Bad — deep relative paths
import { SteeringRule } from "../../workflow/steering/rule";
```

**Import from module index only** — never reach into internals:
```typescript
// ✅ Good
import { SteeringRule, type SteeringRuleConfig } from "#workflow/steering";

// ❌ Bad
import { SteeringRule } from "#workflow/steering/rule";
```

**No explicit `/index.ts`** on subpaths:
```typescript
// ✅ Good
import { something } from "./types";

// ❌ Bad
import { something } from "./types/index.ts";
```

## Code Constraints

| Rule | Limit | Enforced by |
|------|-------|-------------|
| Max file lines | 200 | oxlint `workhorse/max-lines-per-file` |
| Coverage (lines, functions) | 97% | vitest.config.ts |
| Coverage (branches) | 95% | vitest.config.ts |
| Filenames | kebab-case | oxlint |
| Test location | Colocated (`foo.ts` + `foo.test.ts`) | oxlint |

**Every test file must have at least one `it.fails("TODO: ...")`** documenting planned behavior.

## Database

SQLite via drizzle-orm. Schema in `packages/core/src/db/schema/`.

```bash
cd packages/core && bunx drizzle-kit generate  # Generate migrations
```

## Pre-commit

`simple-git-hooks` runs `oxfmt --write` and `oxlint` on staged `.ts/.tsx` files automatically.

## Architecture Notes

- **bootstrap()** creates `Workhorse` instance with config, db, hooks, memory, monitors, tracker, orchestrator, plugins
- **Context system**: Use `useWorkhorse()` inside plugin setup to access services
- **Plugins**: Define with `definePlugin({ manifest, setup, teardown })` — see `MIGRATION.md` for full architecture
- **Hooks**: Event-based pub/sub via mitt (`hooks.on()`, `hooks.emit()`)
- **Services**: MemoryService (L1 context.md + L2 semantic search), MonitorService (polling framework)
