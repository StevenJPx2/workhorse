# 004 — Config loader: test coverage + file-context parse errors

- **Status:** TODO
- **Written against:** commit `95f4cd7` (dirty working tree at audit time — see Drift check)
- **Effort:** M · **Risk:** low (one additive signature change: `loadConfig(cwd, home)`; behavior unchanged for existing callers)
- **Depends on:** 001 (CI gating). Independent of 002/003.

## Why

`src/config/loader.ts` is the newest substantive code in core-v2 (config-plane loader, commit `b6996bc`) and has **zero tests**. Its core behaviors — directory-tree mirroring (`workflows/ralph.toml` → `workflows.ralph`), defu merge precedence (project `.workhorse` over global `~/.config/workhorse`), `.toml` suffix stripping — are exactly the kind of logic that silently regresses. The only check today is `scripts/config-smoke.ts`, which validates an in-code TS object and never touches the file-loading path.

Additionally, a malformed TOML file rejects the whole `loadConfig` with smol-toml's bare error — **no indication of which file failed**. For a tool whose users hand-author `.workhorse/**/*.toml`, "Invalid TOML document" with no path is a support ticket.

There's also a testability blocker: `loadConfig` hardcodes `homedir()`, so tests can't isolate the global root (and worse, a developer's real `~/.config/workhorse` leaks into test runs).

## Current state (verbatim — verify before editing)

`packages/core-v2/src/config/loader.ts` (entire file, ~52 lines):

```ts
import { glob, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { defu } from "defu";
import { parse } from "smol-toml";

import { ResolvedConfig, type ResolvedConfigT } from "./resolved";

function assembleRoot(root: string): Promise<Record<string, unknown>> {
  return Array.fromAsync(glob("**/*.toml", { cwd: root }))
    .then((files) =>
      Promise.all(
        files.map((rel) =>
          readFile(join(root, rel), "utf8").then((text) => ({
            raw: parse(text) as Record<string, unknown>, // ← line 22: no file context on throw
            rel,
          })),
        ),
      ),
    )
    .then((entries) => {
      const tree: Record<string, unknown> = {};
      for (const { rel, raw } of entries) {
        const keys = rel.replace(/\.toml$/u, "").split("/");
        let node = tree;
        for (const key of keys.slice(0, -1)) {
          node[key] ??= {};
          node = node[key] as Record<string, unknown>;
        }
        node[keys.at(-1) ?? rel] = raw;
      }
      return tree;
    });
}

export function loadConfig(cwd = process.cwd()): Promise<ResolvedConfigT> {
  return Promise.all([
    assembleRoot(join(homedir(), ".config", "workhorse")),
    assembleRoot(join(cwd, ".workhorse")),
  ]).then(([global, project]) => ResolvedConfig.parse(defu(project, global)));
}
```

The merged shape it must produce is `ResolvedConfig` (`src/config/resolved.ts`): `{ config?: MainConfig, presets: Record<string, PresetConfig> (default {}), workflows: Record<string, WorkflowConfig> (default {}) }`. A valid minimal workflow TOML (see `WorkflowConfig` in `src/config/workflow.ts` — fields `name`, `states` (min 1), `steps`, `version`; statuses come from `src/schema/status/schema.ts`: `planning | implementing | blocked | ready_for_review | in_review | done`):

```toml
name = "ralph"
version = "1"

[[states]]
name = "implementing"
steps = ["implement"]

[steps.implement]
prologue = "Do the work."
```

Callers of `loadConfig`: `grep -rn "loadConfig" packages/core-v2` currently shows only the definition and `src/config/index.ts`'s re-export — no call sites to update.

## Repo conventions (follow these)

- Bun runtime; tests import from `"vitest"`; run `bun test` from `packages/core-v2/`.
- Tests are **colocated**: create `src/config/loader.test.ts` next to `loader.ts` (do not create a `__tests__/` dir here).
- Test exemplar for tmpdir hygiene: `src/services/script/discover.test.ts` — `mkdtempSync(join(tmpdir(), "wh-..."))` in `beforeEach`, `rmSync(dir, { force: true, recursive: true })` in `afterEach`.
- The injectable-`home` pattern to copy: `discoverScripts(cwd, home = homedir())` in `src/services/script/discover.ts` and `ScriptService`'s constructor `(cwd = process.cwd(), home = homedir())`.
- oxlint: function declarations; alphabetized object keys; files ≤ 200 lines.

## Steps

1. **Make `home` injectable.** Change the signature to match the repo's existing pattern:

   ```ts
   export function loadConfig(
     cwd = process.cwd(),
     home = homedir(),
   ): Promise<ResolvedConfigT> {
     return Promise.all([
       assembleRoot(join(home, ".config", "workhorse")),
       assembleRoot(join(cwd, ".workhorse")),
     ]).then(([global, project]) =>
       ResolvedConfig.parse(defu(project, global)),
     );
   }
   ```

2. **Add file context to parse failures.** In `assembleRoot`, wrap the parse so the rejection names the file:

   ```ts
   readFile(join(root, rel), "utf8").then((text) => {
     try {
       return { raw: parse(text) as Record<string, unknown>, rel };
     } catch (error) {
       throw new Error(
         `Failed to parse ${join(root, rel)}: ${error instanceof Error ? error.message : String(error)}`,
         { cause: error },
       );
     }
   }),
   ```

3. **Handle the missing-root case explicitly.** Check what `node:fs/promises` `glob` does when `cwd` doesn't exist (write a quick throwaway test first). If it rejects, guard `assembleRoot` to return `{}` for a nonexistent root — both roots are routinely absent (fresh machine, fresh project). If it already resolves to an empty list, add a test pinning that behavior and skip the guard.

4. **Write `src/config/loader.test.ts`** covering, at minimum:
   - **Empty world:** neither root exists → resolves to `{ presets: {}, workflows: {} }` (per schema defaults; `config` absent).
   - **Mirroring:** project root containing `workflows/ralph.toml` (the minimal TOML above) → result has `workflows.ralph.name === "ralph"`.
   - **Nesting:** `config.toml` at root level → lands under `config` key.
   - **Precedence:** same path `config.toml` in both roots with different `defaults.model` values → project value wins; a key present **only** in global survives the merge (defu deep-merges).
   - **Parse error context:** a project file `workflows/bad.toml` containing `not [valid toml` → `loadConfig` rejects with a message containing `workflows/bad.toml` (use `await expect(...).rejects.toThrow(/bad\.toml/u)`).
   - **Schema rejection:** a structurally invalid workflow (e.g. `states = []`, violating `.min(1)`) → rejects with a ZodError.

   Build each case with tmpdirs for both `cwd` and `home`, writing TOML fixtures with `mkdirSync`/`writeFileSync`, and call `loadConfig(cwd, home)`.

5. **Verify**, from `packages/core-v2/`:

   ```bash
   bun test          # expected: 0 fail, includes the ~6 new loader tests
   bun run typecheck # expected: exits 0
   bun run lint      # expected: 0 errors
   bun run smoke     # expected: prints the validated example config JSON, exits 0 (unchanged)
   ```

## Out of scope

- The cascade resolver, `when` expression parser, and cross-reference validation — these are the documented "Planned" milestone (see `src/config/README.md` "Implementation status") and deserve their own design plan; do not start them here.
- Changing the merge library or merge semantics.
- Windows path-separator handling in `rel.split("/")` (known, deliberately deferred).
- `config/example.ts`, `scripts/config-smoke.ts`, and all schema files (except reading them for fixture shapes).

## Done criteria (machine-checkable)

- [ ] `src/config/loader.test.ts` exists, colocated, and `cd packages/core-v2 && bun test loader` runs it with 0 fail
- [ ] Full `bun test` exits 0; `bun run typecheck` exits 0; `bun run lint` 0 errors
- [ ] `grep -n "Failed to parse" src/config/loader.ts` shows the wrapped error
- [ ] `grep -rn "loadConfig(" packages/core-v2/src --include="*.ts" | grep -v test | grep -v "export function"` returns nothing (i.e. no call sites missed by the signature change)

## Drift check

Before editing, confirm `loader.ts` matches the excerpt. If `loadConfig` already takes a `home` parameter or a `loader.test.ts` exists, those steps are done — reconcile and report. If the loader has been replaced by the cascade resolver work, STOP and report; this plan predates it.

## Escape hatches

- If `Array.fromAsync(glob(...))` behaves differently under Bun than Node for a missing `cwd` (step 3), pin whichever behavior Bun exhibits with a test and note it — do not add a Node-only workaround.
- If defu's deep-merge produces a surprising result for the precedence test (e.g. array concatenation), record the actual behavior in the test with a comment and report it — that's a real semantics question for the maintainer, not something to paper over.

## Maintenance note

These tests become the safety net for the **cascade resolver** milestone (global → project → workflow → preset → step), which will build directly on `loadConfig`'s output. Whoever implements it should extend `loader.test.ts` rather than starting a parallel fixture system. The defu-precedence test doubles as documentation of which layer wins — keep it updated if the merge order ever changes.
