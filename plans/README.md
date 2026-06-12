# Advisor plans — packages/core-v2

Implementation plans from a codebase audit of `packages/core-v2` (scope: that package only — `packages/core`, `plugins/*`, `tui`, and the oxlint plugin were **not** audited).

> ⚠️ Not to be confused with `plan/` (the repo's design/architecture docs). This directory holds **executable improvement plans**: each file is self-contained and written to be executed by an engineer or agent with no prior context. Executors should update the Status column and the `Status:` line inside each plan as they go.

- **Audited at:** commit `95f4cd7` with a dirty working tree (uncommitted core-v2 changes were included in the audit). Each plan carries its own drift check; if the cited code has changed, the plan says what to do.
- **Verification baseline at audit time:** `bun run typecheck` ✅ · `bun run lint` ✅ (8 warnings, 0 errors) · `bun test` ✅ 57/57 — but tests were **not** wired into CI (that's plan 001).
- **Recommendation before executing:** commit or stash the current working-tree changes so each plan lands as a clean, reviewable diff.

## Execution order & status

| #   | Plan                                                                               | Addresses                                                                                     | Status | Depends on      |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | --------------- |
| 001 | [Wire core-v2 tests into root test run and CI](001-wire-core-v2-into-ci.md)        | Tests silently skipped by CI/`check`                                                          | TODO   | —               |
| 003 | [Unify the tool error contract](003-unify-tool-error-contract.md)                  | Tools throw vs. return `ToolResult` inconsistently                                            | TODO   | 001             |
| 002 | [Harden ScriptService](002-harden-script-service.md)                               | ENOENT crash on fresh projects · `write_script` path traversal · one bad file kills discovery | TODO   | 001 (soft: 003) |
| 004 | [Config loader tests + file-context errors](004-config-loader-tests-and-errors.md) | Newest code untested · TOML errors name no file                                               | TODO   | 001             |
| 005 | [Low-priority cleanups](005-low-priority-cleanups.md)                              | Registry dedupe · unused deps · README · test layout                                          | TODO   | 001, 002, 003   |

```
001 ──┬── 003 ──┬── 002 ──┐
      ├── 004   │         ├── 005
      └─────────┴─────────┘
```

004 is independent of 002/003 and can run in parallel with them.

## Findings considered and rejected (do not re-audit)

- Windows path-separator handling in `config/loader.ts` (`rel.split("/")`) — Bun/macOS target; deferred deliberately.
- Skill frontmatter regex requiring a trailing newline after the closing `---` — cosmetic edge case.
- Option-name → env-var collision in `defineScript` (`foo-bar` and `foo_bar` both map to `FOO_BAR`) — trivial impact.
- Positional-argument shell escaping in `defineScript` — **verified safe** (`'\''` idiom; `just-bash` is a sandboxed interpreter with fs rooted at `ctx.cwd`).
- Performance category overall — no hot paths exist yet at this stage of the build.

## Direction options surfaced (not planned — maintainer's call)

- **D1:** Config cascade resolver + cross-reference validation (states→steps, step→preset, exits→statuses) — the documented "Planned" milestone in `src/config/README.md`; gates the workflow engine.
- **D2:** `when` expression parser — small closed grammar, highly testable in isolation.
- **D3:** Minimal `GlobalContext` bootstrap factory (`loadConfig` + `createHooks`) — lets services be exercised end-to-end; powers the standalone-services (Moby) story.

Ask for a follow-up plan (`plan <description>`) if any of these should be specified.
