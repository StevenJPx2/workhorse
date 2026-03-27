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
```

## Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use Solid.js patterns (createSignal, createEffect, etc.)
- OpenTUI components use snake_case (`<tab_select>`, `<scroll_box>`)
- File names use kebab-case (`ticket-pane.tsx`)

## Important Files

- `PLAN.md` - Full architecture and implementation plan
- `CONTEXT.md` - External dependency documentation
- `src/lib/db.ts` - SQLite schema and queries
- `src/lib/atlassian.ts` - MCP client for Jira
- `src/hooks/useGasTown.ts` - Gas Town CLI integration

## Testing

Run tests with `bun test`. Test files should be colocated with source files using `.test.ts` suffix.

## Current Phase

Check PLAN.md for the current implementation phase and task checklist.
