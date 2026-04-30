# Jiratown Development Guide

## Quick Start

```bash
bun install                    # Install dependencies
bun run check                  # Full audit: lint → typecheck → test → fallow
bun run test                   # Run all tests
bun run --filter @jiratown/core test   # Test single package
```

## Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install all dependencies |
| `bun run check` | Full audit (lint → typecheck → test → fallow) |
| `bun run test` | Run tests across all packages |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Run oxlint |
| `bun run lint:fix` | Fix linting issues |
| `bun run format` | Check formatting with oxfmt |
| `bun run format:fix` | Fix formatting |
| `bun run fallow` | Run fallow analysis |

### Package-specific

```bash
bun run --filter @jiratown/core test        # Test core package
bun run --filter @jiratown/plugin-jira test # Test jira plugin
cd packages/core && bunx drizzle-kit generate  # Generate DB migrations
```

## Code Constraints

| Rule | Limit | Enforced by |
|------|-------|-------------|
| Max file lines | 200 | oxlint `jiratown/max-lines-per-file` |
| Coverage (lines, functions) | 97% | vitest.config.ts |
| Coverage (branches) | 95% | vitest.config.ts |
| Filenames | kebab-case | oxlint |
| Test location | Colocated (`foo.ts` + `foo.test.ts`) | oxlint |

## Import Rules (enforced by oxlint)

### Use Path Aliases

Defined in `packages/core/tsconfig.json`:

```typescript
// ✅ Good
import { SteeringRule } from "#workflow/steering";
import { HookEmitter } from "#lib/hooks";
import { Database } from "#db";

// ❌ Bad — deep relative paths
import { SteeringRule } from "../../workflow/steering/rule";
```

### Import from Module Index Only

Never reach into internal files:

```typescript
// ✅ Good
import { SteeringRule, type SteeringRuleConfig } from "#workflow/steering";

// ❌ Bad — importing from internal file
import { SteeringRule } from "#workflow/steering/rule";
```

### No Explicit `/index.ts`

```typescript
// ✅ Good
import { something } from "./types";

// ❌ Bad
import { something } from "./types/index.ts";
```

## Testing

### Location

Tests are colocated with source files:
```
foo.ts
foo.test.ts
```

### Required TODO Tests

Every test file must have at least one `it.fails("TODO: ...")` documenting planned behavior:

```typescript
describe("MyFeature", () => {
  it("does something", () => {
    // actual test
  });

  it.fails("TODO: should handle edge case X", () => {
    // documents future behavior
  });
});
```

### Running Tests

```bash
bun run test                              # All packages
bun run --filter @jiratown/core test      # Single package
bun run --filter @jiratown/core test:watch # Watch mode
bun run --filter @jiratown/core test:coverage # With coverage
```

## Database

SQLite via drizzle-orm. Schema in `packages/core/src/db/schema/`.

### Tables

- `issues` — Tracked issues from Jira/GitHub
- `issue_events` — Events on issues (comments, status changes, etc.)
- `notifications` — Push notifications for agents

### Migrations

```bash
cd packages/core
bunx drizzle-kit generate  # Generate migration from schema changes
```

Migrations are in `packages/core/drizzle/`.

## Pre-commit Hooks

`simple-git-hooks` runs automatically on staged `.ts/.tsx` files:

1. `oxfmt --write` — Format code
2. `oxlint` — Lint check

## Adding a New Plugin

1. Create directory under `packages/plugins/<name>/`
2. Add `package.json` with proper naming (`@jiratown/plugin-<name>`)
3. Create `src/index.ts` with `definePlugin()`:

```typescript
import { definePlugin, useJiratown } from "@jiratown/core";
import { z } from "zod/v4";

export const MyConfigSchema = z.object({
  apiKey: z.string(),
});

export type MyConfig = z.infer<typeof MyConfigSchema>;

export default definePlugin({
  manifest: {
    name: "my-plugin",
    version: "0.0.1",
    description: "My custom plugin",
  },
  configSchema: MyConfigSchema,
  setup(config) {
    const { hooks, tracker, orchestrator, monitors } = useJiratown();
    
    // Register parsers, tools, monitors, steering rules
  },
  teardown() {
    // Cleanup resources
  },
});
```

4. Add to workspace in root `package.json` (already includes `packages/plugins/*`)
5. Register in application after bootstrap:

```typescript
import myPlugin from "@jiratown/plugin-my-plugin";

const jt = await bootstrap();
jt.plugins.register(myPlugin);
await jt.plugins.setup();
```

## Module READMEs

Each module has its own README with detailed documentation:

- `packages/core/src/config/README.md` — Config loading
- `packages/core/src/context/README.md` — Context system
- `packages/core/src/db/README.md` — Database
- `packages/core/src/lib/hooks/README.md` — Hooks
- `packages/core/src/plugins/README.md` — Plugin system
- `packages/core/src/services/memory/README.md` — Memory service
- `packages/core/src/services/monitor/README.md` — Monitor service
- `packages/core/src/workflow/tracker/README.md` — Tracker

## Reference

- [AGENTS.md](../AGENTS.md) — Agent coding guidelines
- [MIGRATION.md](../MIGRATION.md) — Old → new mapping
- [plan/README.md](../plan/README.md) — Build plan
- [plan/PROGRESS.md](../plan/PROGRESS.md) — Current progress
