# 001 — Wire core-v2 tests into the root test run and CI

- **Status:** TODO
- **Written against:** commit `95f4cd7` (note: working tree was dirty when audited; excerpts reflect working-tree state — see Drift check)
- **Effort:** S · **Risk:** low
- **Depends on:** nothing. **Blocks:** plans 002, 003, 004, 005 (their new tests only gate CI once this lands).

## Why

`packages/core-v2` has 57 passing tests (run via `bun test`), but its `package.json` has **no `test` script**. The monorepo root's `test` script is `bun run --filter '*' test`, which only runs packages that define a `test` script — so core-v2 is silently skipped. CI (`.github/workflows/ci.yml`, "Test" step) runs `bun run test`, and the pre-commit gate `bun run check` runs the same. Result: **none of core-v2's tests run in CI or pre-commit today.** A regression in this package would merge green.

## Current state

`packages/core-v2/package.json` (entire file):

```json
{
  "name": "core-v2",
  "module": "src/index.ts",
  "type": "module",
  "scripts": {
    "lint": "oxlint .",
    "lint:fix": "oxlint . --fix",
    "fallow": "fallow",
    "smoke": "bun scripts/config-smoke.ts",
    "typecheck": "tsc --noEmit"
  },
  ...
}
```

Note `typecheck` and `lint` already exist, so root `bun run typecheck` / `bun run lint` already cover this package. Only `test` is missing.

Root `package.json` (monorepo root) relevant scripts — **do not modify these**:

```json
"test": "bun run --filter '*' test",
"check": "bun run format:check && bun run lint && bun run typecheck && bun run test && bun run fallow",
```

## Steps

1. In `packages/core-v2/package.json`, add to `"scripts"` (keep keys in their existing order style; insert `"test"` after `"smoke"`):

   ```json
   "test": "bun test"
   ```

2. Verify locally, from `packages/core-v2/`:

   ```bash
   bun test
   ```

   Expected: `57 pass, 0 fail` (count may be higher if other plans landed first — what matters is `0 fail`).

3. Verify the filter wiring, from the **monorepo root**:

   ```bash
   bun run --filter core-v2 test
   ```

   Expected: the same test run output, executed in the core-v2 package directory.

4. Verify the full root run, from the monorepo root:

   ```bash
   bun run test
   ```

   Expected: output includes a `core-v2 test` section with `0 fail`, alongside the other packages' test runs. **All packages must still pass** — if another package fails, it must be failing the same way without your change (confirm with `git stash && bun run test`); report it, don't fix it.

5. **Coverage measurement (measure only — do not gate):** from `packages/core-v2/`:

   ```bash
   bun test --coverage
   ```

   Record the line/function coverage numbers in your completion report. **Do not** add a coverage threshold to `bunfig.toml` in this plan — `AGENTS.md` claims a 97/95 gate but that config belongs to `packages/core`'s vitest setup; deciding the core-v2 gate is a separate, human decision. Just report the numbers.

## Out of scope

- Root `package.json`, CI workflow files, any other package's scripts — no changes needed; the `--filter '*'` mechanism picks the new script up automatically.
- Adding `scripts/config-smoke.ts` to CI.
- Adding a coverage threshold (see step 5).
- Any source code under `src/`.

## Done criteria (machine-checkable)

- [ ] `cd packages/core-v2 && bun run test` exits 0
- [ ] `bun run --filter core-v2 test` (from root) exits 0 and shows the test run
- [ ] `bun run test` (from root) exits 0 and its output contains core-v2's tests
- [ ] `git diff --name-only` shows exactly one file changed: `packages/core-v2/package.json`

## Drift check

Before starting, confirm `packages/core-v2/package.json` still lacks a `test` script. If a `test` script already exists, this plan is obsolete — STOP and report.

## Escape hatches

- If `bun run --filter core-v2 test` does **not** pick up the new script (filter matching issue), STOP and report the exact output — do not rename the package or restructure scripts to force it.
- If root `bun run test` fails in _another_ package, report which one and stop; that failure predates or is unrelated to this change.

## Maintenance note

Every future plan for this package assumes `bun test` is the CI-gating command. If the package later migrates to vitest proper (to match `packages/core`'s coverage tooling), this script is the single place to swap.
