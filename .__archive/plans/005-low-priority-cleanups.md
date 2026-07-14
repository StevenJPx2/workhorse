# 005 — Low-priority cleanups: registry dedupe, unused deps, README, test layout

- **Status:** TODO
- **Written against:** commit `95f4cd7` (dirty working tree at audit time — see Drift check)
- **Effort:** S–M · **Risk:** low
- **Depends on:** 001 (CI gating); land **after** 002 and 003 to avoid merge friction in the same files. Each section below is independently committable — do them as separate commits in the order given.

## Section A — Registry duplicate-name semantics (SkillService / ToolService)

### Why

Both registries `push` without deduplication:

- `src/services/skill/service.ts:24` — `this.skills.push(...discoverSkills(this.cwd, this.home));` in `setup`: calling `setup` twice duplicates every skill.
- `src/services/skill/service.ts:29` — the `skills:register` hook pushes; a plugin registering a skill whose name already exists creates a duplicate, and `load_skill`'s `find` (first match wins, `src/services/skill/tools/load.ts`) makes the plugin's version **silently unreachable**.
- `src/services/tool/service.ts:13` — same pattern for tools.

Decision (encode this, it's the design intent): **registries dedupe by `name`; last registration wins.** This makes plugin overrides work (a later `skills:register` replaces a discovered skill) and makes `setup` idempotent.

### Current state

`src/services/skill/service.ts` stores `private readonly skills: SkillT[] = []`; `list()` returns it; `teardown()` sets `length = 0`. `src/services/tool/service.ts` is analogous with `private readonly tools: AnyTool[] = []`.

### Steps

1. In `SkillService`, switch storage to `private readonly skills = new Map<string, SkillT>();`
   - `setup`: `for (const skill of discoverSkills(this.cwd, this.home)) this.skills.set(skill.name, skill);` and the hook handler becomes `this.skills.set(skill.name, skill);`
   - `list(): readonly SkillT[]` returns `[...this.skills.values()]`
   - `teardown()`: `this.skills.clear();`
2. Same transformation for `ToolService` (`Map<string, AnyTool>` keyed by `tool.name`).
3. Tests (extend `src/services/__tests__/skill-service.test.ts` and `tool-service.test.ts`, following their existing fixture/hook patterns):
   - registering a skill via the `skills:register` hook with a name that already exists replaces it — `load_skill` for that name returns the **new** instructions;
   - calling `setup` twice does not duplicate `list()` entries;
   - same-name tool registration: `list()` contains one entry, the later one.

### Verify

`cd packages/core-v2 && bun test && bun run typecheck && bun run lint` — 0 fail / exit 0 / 0 errors.

## Section B — Remove unused dependencies

### Why

`es-toolkit` and `unctx` are declared in `packages/core-v2/package.json` but have **zero imports** in `src/` and `scripts/` (verified by grep at audit time).

### Steps

1. Re-verify: `grep -rn "es-toolkit\|unctx" packages/core-v2/src packages/core-v2/scripts` must return nothing. If it returns matches, **skip this section** and report — the deps gained usage since the audit.
2. Remove both lines from `"dependencies"` in `packages/core-v2/package.json`.
3. Run `bun install` from the **monorepo root** (this updates the shared `bun.lock` — expected and required; it's the one permitted lockfile mutation).
4. Verify: `cd packages/core-v2 && bun test && bun run typecheck` both exit 0, and `bun run smoke` still prints the example config.

Note: these deps may have been staged deliberately for the orchestrator build (`unctx` for context, per the design docs' context model). Removing them is still correct — re-adding a dep when it's actually used is one line, while unused deps rot. Mention the removal in the commit message so the maintainer can veto.

## Section C — Replace the boilerplate README

### Why

`packages/core-v2/README.md` is unmodified `bun init` output ("To install dependencies… This project was created using bun init"). It says nothing about what core-v2 is. Real documentation exists elsewhere and just needs pointers.

### Steps

1. Rewrite `packages/core-v2/README.md` (aim ≤ 40 lines) containing:
   - One paragraph: core-v2 is the from-scratch rearchitecture of Workhorse's core — the Orchestrator → Workflow → Step → Harness pipeline with a declarative TOML config plane; currently the config plane and script/skill/tool services are built, the runtime is scaffolding.
   - Pointers: canonical spec `plan/rearchitecture/rearchitecture.md`; decision log `plan/rearchitecture/learnings.md`; config-plane spec `src/config/README.md`; conventions `AGENTS.md` (repo root).
   - Commands block: `bun test`, `bun run typecheck`, `bun run lint`, `bun run smoke` (each with a half-line description).
2. Verify: `bun run lint` from `packages/core-v2/` exits 0 (markdown isn't linted, but run it anyway as the standard gate); links resolve — check each referenced path exists with `ls`.

## Section D — Normalize test layout to colocated files

### Why

The repo convention (build-skill docs, `AGENTS.md`) is **colocated tests** (`foo.ts` + `foo.test.ts`). Two clusters use `__tests__/` directories instead: `src/schema/script/__tests__/` (3 files) and `src/services/__tests__/` (5 files, incl. the shared `fixture.ts`). Other tests are already colocated (`src/services/script/discover.test.ts` etc.).

### Steps

1. `git mv` each test next to its subject, adjusting relative imports:
   - `src/schema/script/__tests__/define.test.ts` → `src/schema/script/define.test.ts` (imports `../define` → `./define`, `../schema` → `./schema`)
   - `__tests__/help.test.ts` → `src/schema/script/help.test.ts`; `__tests__/invoke.test.ts` → `src/schema/script/invoke.test.ts`
   - `src/services/__tests__/base.test.ts` → `src/services/base.test.ts`
   - `src/services/__tests__/script-service.test.ts` → `src/services/script/service.test.ts` (imports `../script` → `./index` or `.`; `./fixture` → see next step)
   - `src/services/__tests__/skill-service.test.ts` → `src/services/skill/service.test.ts`
   - `src/services/__tests__/tool-service.test.ts` → `src/services/tool/service.test.ts`
   - `src/services/__tests__/fixture.ts` → `src/services/fixture.ts` — **caution:** check whether a bare `fixture.ts` in `src/services/` gets re-exported by `src/services/index.ts` (it must not; index currently exports `./base`, `./script`, `./skill`, `./tool` only — leave index untouched) and whether oxlint's index-only-import rule complains about tests importing `../fixture`. If the lint rule fires, name it `fixture.test-helper.ts` is **not** the convention — instead keep a `__tests__/fixture.ts`? No: STOP and report the lint output; the right exemption is a maintainer call.
2. Remove the now-empty `__tests__` directories.
3. Verify: `bun test` still discovers and passes **the same number of tests as before the move** (record the count before and after — they must match exactly), `bun run typecheck` exits 0, `bun run lint` 0 errors.

## Out of scope (whole plan)

- Any behavior change beyond Section A's last-wins semantics.
- `ScriptService` internals (plan 002 owns that file's logic; only Section D moves its test).
- The `db`, `hooks`, `orchestrator`, `workflow` stubs.
- Renaming test files' describe blocks or rewriting test bodies (only import paths change in Section D).

## Done criteria (machine-checkable)

- [ ] `cd packages/core-v2 && bun test` exits 0 with test count ≥ pre-plan count (A adds tests; D must not lose any)
- [ ] `bun run typecheck` exits 0; `bun run lint` 0 errors
- [ ] `grep -rn "es-toolkit\|unctx" packages/core-v2/src packages/core-v2/package.json` returns nothing (Section B)
- [ ] `ls packages/core-v2/src/services/__tests__ packages/core-v2/src/schema/script/__tests__ 2>&1` reports both as nonexistent (Section D)
- [ ] README no longer contains the string "bun init" (Section C)

## Drift check

Re-verify each section's premise before executing it (the greps and file listings above). Plans 002/003 will have touched `service.ts`, `write.ts`, `define.ts`, and the script-service tests — that's expected; Section D moves tests _after_ their content settled.

## Escape hatches

- Section A: if `Tool`/`Skill` name uniqueness is enforced somewhere else by the time you start (e.g. a registry class appeared under `orchestrator/`), STOP that section and report.
- Section B: any grep hit → skip section, report.
- Section D: if the oxlint custom rules (index-only imports, filename casing) reject the moved files in a way not anticipated above, STOP that section with the exact lint output rather than adding ignore pragmas.

## Maintenance note

Section A's "last wins" is now the documented registry semantic — the future capability-assembly logic (`(agent ∪ services) ∩ allowlist`, per the design docs) should treat `list()` as already-deduped. Section D makes the test layout uniform, so new code should always colocate; if a shared-fixture pattern grows, promote `fixture.ts` into a proper `testing` helper module rather than scattering copies.
