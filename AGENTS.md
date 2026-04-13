# Agent Instructions for Jiratown

## Project Overview

Jiratown is a terminal UI dashboard for orchestrating multiple AI coding agents working on Jira tickets. See PLAN.md for full architecture.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **UI**: OpenTUI + Solid.js (`@opentui/solid`)
- **Database**: SQLite (`better-sqlite3`)
- **Config**: TOML
- **CLI**: Commander

## Key Commands

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Build for production
bun run build

# Run tests
bun test

# Lint code (oxlint + custom Jiratown rules)
bun run lint

# Lint and auto-fix
bun run lint:fix

# Format code (oxfmt)
bun run format

# Format and auto-fix
bun run format:fix

# Check test coverage (must be >= 97%)
bun run coverage

# Full check (lint + coverage)
bun run check
```

## Pre-Commit Hooks

Pre-commit hooks run automatically via `simple-git-hooks` + `lint-staged`:

- **oxfmt** — auto-format staged `.ts`/`.tsx` files
- **oxlint** — lint staged `.ts`/`.tsx` files with project rules

To set up hooks after cloning: `bun run prepare`

## Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use Solid.js patterns (createSignal, createEffect, etc.)
- OpenTUI components use snake_case (`<tab_select>`, `<scroll_box>`)
- File names use kebab-case (`ticket-pane.tsx`)

## Code Quality

See [CODE_QUALITY.md](./CODE_QUALITY.md) for architectural principles and patterns.

## Code Enforcement Rules

### Max 200 Lines Per File

- **Strict limit**: No file should exceed 200 lines of code
- If a file grows beyond this, split it into multiple files in a colocated folder

### Kebab-Case File Names

- All file names must use kebab-case: `ticket-sidebar.tsx`, `use-sidebar-resize.ts`
- No PascalCase or camelCase file names

### Colocated Folder Structure

- Related files must be grouped in folders with an `index.ts` for exports
- Example structure:
  ```
  ticket-sidebar/
  ├── index.ts              # Re-exports all public APIs
  ├── ticket-sidebar.tsx    # Main component
  ├── ticket-item.tsx       # Sub-component
  ├── sidebar-header.tsx    # Sub-component
  └── use-ticket-navigation.ts  # Related hook
  ```
- The `index.ts` should export all public components and hooks
- Keep implementation details private (don't export everything)

### Test Colocation Boundaries

- Test files use `.test.ts` suffix, colocated with source files
- When a folder has >2 source files and test ratio exceeds 40%, move tests to `__tests__/`
- This keeps folders clean while maintaining discoverability

### Test-Driven Development (TDD)

- **97% code coverage required** across all files
- Write tests before or alongside implementation
- Test files are colocated with source files using `.test.ts` suffix
- Run `bun run coverage` to verify coverage meets the 97% threshold
- The coverage check is included in `bun run check` and will fail if below threshold
- Every new function, component, and hook must have corresponding tests

## Important Files

- `PLAN.md` - Full architecture and implementation plan
- `CONTEXT.md` - External dependency documentation
- `src/lib/db.ts` - SQLite schema and queries
- `src/lib/atlassian.ts` - MCP client for Jira

## Testing

Run tests with `bun test`. Test files should be colocated with source files using `.test.ts` suffix.

## Current Phase

Check PLAN.md for the current implementation phase and task checklist.
