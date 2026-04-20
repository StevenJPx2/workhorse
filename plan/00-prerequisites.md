# Step 0: Monorepo Scaffold

Bun workspace monorepo with `packages/core`. Tooling, deps, linting, structure.

## Root `package.json`

```json
{
  "name": "jiratown",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "bun test --recursive",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "oxlint .",
    "lint:fix": "oxlint . --fix",
    "format": "oxfmt .",
    "format:fix": "oxfmt . --write",
    "check": "bun run lint && bun run test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5",
    "oxlint": "^1.59.0",
    "@oxlint/plugins": "^1.59.0",
    "oxfmt": "^0.44.0",
    "simple-git-hooks": "^2.13.1",
    "lint-staged": "^16.4.0"
  },
  "simple-git-hooks": {
    "pre-commit": "bunx lint-staged"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "oxfmt --write",
      "oxlint"
    ]
  }
}
```

## `packages/core/package.json`

```json
{
  "name": "@jiratown/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

## Linting: oxlint + custom plugin

Carry over from old repo. oxlint for linting, oxfmt for formatting, pre-commit hooks via `simple-git-hooks` + `lint-staged`.

### `.oxlintrc.json`

```json
{
  "$schema": "https://oxc.rs/docs/guide/usage/linter/config.html",
  "jsPlugins": ["./oxlint/eslint-plugin-jiratown"],
  "ignorePatterns": ["oxlint/**", "dist/**", "node_modules/**"],
  "rules": {
    "jiratown/max-lines-per-file": ["error", 200],
    "jiratown/enforce-kebab-case-filenames": "warn",
    "jiratown/enforce-colocated-exports": "warn",
    "jiratown/enforce-test-colocation": "warn"
  }
}
```

### Custom rules (`oxlint/eslint-plugin-jiratown/`)

Port from old repo, drop `prefer-composables-over-props` (TUI-only).

| Rule | Severity | What it does |
|------|----------|-------------|
| `max-lines-per-file` | error (200) | Max 200 lines per source file, 500 for test files |
| `enforce-kebab-case-filenames` | warn | All files must be kebab-case (allows `index.ts`) |
| `enforce-colocated-exports` | warn | Folders with multiple source files must have `index.ts` |
| `enforce-test-colocation` | warn | When folder test ratio >40%, tests must move to `__tests__/` |
| `no-single-reference-function` | warn | Non-exported functions used in exactly one place should be inlined |

Standalone package at `oxlint/eslint-plugin-jiratown/` with its own `package.json` and `tsconfig.json`. Built via `bun build index.ts --outdir . --target bun`.

## `tsconfig.json`

- `strict: true`, `module: "Preserve"`, `moduleResolution: "bundler"`
- `noUncheckedIndexedAccess: true`
- Path aliases: `#hooks`, `#types`, `#services/*`, etc.

## Directory Structure

```
packages/core/src/
├── index.ts
├── config/
├── types/
├── hooks/
├── plugins/
├── db/
├── services/
│   ├── memory/
│   └── monitor/
├── issue-provider/
├── agent-adapter/
└── mcp-server/
```

## Tasks

1. Convert root to workspace root
2. Create `packages/core/` with package.json + tsconfig
3. Create directory structure (empty `index.ts` files)
4. Port `oxlint/eslint-plugin-jiratown/` from old repo (drop `prefer-composables-over-props`)
5. Create `.oxlintrc.json` at root
6. Remove `bun init` placeholder `index.ts` from root
7. Keep docs at root (`MIGRATION.md`, `CLAUDE.md`, `architecture.*`, `plan/`)
8. Run `bun run prepare` to set up git hooks
9. Verify: `bun install`, `bun test`, `bun run typecheck`, `bun run lint` all pass
