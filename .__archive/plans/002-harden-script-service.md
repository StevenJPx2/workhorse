# 002 — Harden ScriptService: missing dir, path traversal, per-file isolation

- **Status:** TODO
- **Written against:** commit `95f4cd7` (dirty working tree at audit time — see Drift check)
- **Effort:** S–M · **Risk:** low (additive guards; one behavior change: bad script files are skipped instead of crashing discovery)
- **Depends on:** 001 (so the new tests gate CI). Land **after** 003 if both are queued — 003 settles the error contract these guards follow; if 003 hasn't landed, follow this plan as written (it is self-sufficient).

## Why

Three defects in the script service, all confirmed by reading the code:

1. **Crash on fresh projects.** `discoverScripts` calls `readdirSync(dir)` on `<cwd>/.workhorse/scripts` without checking the directory exists. Any project that hasn't created that directory (i.e. most projects) gets an `ENOENT` throw the moment `ScriptService.setup()` runs. The existing tests never catch this because their `beforeEach` always creates the dir.
2. **Path traversal in an agent-facing tool.** The `write_script` tool passes the agent-supplied `name` straight into `join(this.dir, \`${name}.sh\`)`. A name like `../../.git/hooks/pre-commit` writes outside the scripts directory. Workhorse's whole premise is capability-gated agents (`write_globs` etc.), so an unvalidated filename here undercuts the product's security model.
3. **One bad file poisons all discovery.** `readScript` does `JSON.parse` + `ScriptArgs.parse` on the `#workhorse:args` line; a single malformed script file throws and aborts the entire discovery pass, taking every valid script down with it.

## Current state (verbatim excerpts — verify before editing)

`packages/core-v2/src/services/script/discover.ts`, `discoverScripts` (lines ~66-78). Note the skill-scripts helper above it _does_ guard with `existsSync` — mirror that:

```ts
export function discoverScripts(
  cwd: string,
  home: string = homedir(),
): ScriptT[] {
  const scripts: ScriptT[] = [];
  const dir = join(cwd, SCRIPTS_DIR);
  for (const file of readdirSync(dir)) {
    // ← line 71: throws ENOENT if dir missing
    if (file.endsWith(".sh")) {
      scripts.push(readScript(join(dir, file), basename(file, ".sh")));
    }
  }
  loadSkillScripts(scripts, cwd, home);
  return scripts;
}
```

`readScript` in the same file (lines ~30-44) — the throwing parse:

```ts
function readScript(path: string, name: string): ScriptT {
  const command = readFileSync(path, "utf8");
  return defineScript({
    args: ScriptArgs.parse(
      JSON.parse(
        command
          .split("\n")
          .find((raw) => raw.startsWith(ARGS_PREFIX))
          ?.slice(ARGS_PREFIX.length) ?? "{}",
      ),
    ),
    command,
    description: extractDescription(command, name),
    name,
  });
}
```

`packages/core-v2/src/services/script/service.ts`, the private `write` member (lines ~52-67) — the unvalidated `name`:

```ts
  private readonly write: WriteScript = ({
    args,
    command,
    description,
    name,
  }) => {
    const header: string[] = [];
    if (description !== undefined) {
      header.push(`# ${description}`);
    }
    if (args !== undefined) {
      header.push(encodeArgs(args));
    }
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(
      join(this.dir, `${name}.sh`),               // ← line 63: traversal
      [...header, command].join("\n"),
    );
    this.refresh();
  };
```

`packages/core-v2/src/services/script/tools/write.ts` — the tool's `execute` calls `write(input)` unconditionally and returns `{ ok: true, output: \`Saved script "${input.name}".\` }`; its input schema is `name: z.string()` with no constraint.

## Repo conventions (follow these)

- Bun runtime. Tests import from `"vitest"` (Bun maps it to `bun:test`); run with `bun test` from `packages/core-v2/`.
- oxlint enforces: **function declarations** (`func-style: declaration` — no top-level arrow consts for named functions), alphabetized object keys (`sort-keys` warns), files ≤ 200 lines.
- Existing test exemplars to imitate: `src/services/script/discover.test.ts` (tmpdir setup/teardown pattern) and `src/services/__tests__/script-service.test.ts` (the `contributedTools()` helper for exercising tools through the service).
- Tool failures return `{ ok: false, error: string }` (`ToolResultT`, `src/schema/tool/result.ts`) — never throw from a tool's `execute`.

## Steps

1. **Guard the missing directory.** In `discoverScripts` (`discover.ts`), wrap the project-scripts loop in an existence check, mirroring `loadSkillScripts`:

   ```ts
   const dir = join(cwd, SCRIPTS_DIR);
   if (existsSync(dir)) {
     for (const file of readdirSync(dir)) {
       ...
     }
   }
   ```

   (`existsSync` is already imported at line 1.)

2. **Isolate per-file parse failures.** In both loops (`discoverScripts` and `loadSkillScripts`), wrap the `scripts.push(readScript(...))` call in `try { ... } catch { /* skip unparseable script */ }` so one bad file is skipped and the rest load. Keep the catch silent with the comment — there is no logging facility in this package yet (see Maintenance note). If extracting a small helper keeps the file under 200 lines, name it with a function declaration (e.g. `function pushScript(...)`).

3. **Validate script names at the agent boundary.** In `tools/write.ts`:
   - Add at module scope: `const SCRIPT_NAME = /^[\w-]+$/u;`
   - In `execute`, before calling `write(input)`:

     ```ts
     if (!SCRIPT_NAME.test(input.name)) {
       return Promise.resolve({
         error: `Invalid script name "${input.name}". Use letters, digits, "-" and "_" only.`,
         ok: false,
       });
     }
     ```

4. **Defense in depth in the service.** In `service.ts`'s `write` member, before `writeFileSync`, throw on a name that fails the same pattern (import or re-declare the regex — prefer exporting `SCRIPT_NAME` from `tools/write.ts` is wrong layering; instead put the regex + a `isValidScriptName(name: string): boolean` function declaration in `discover.ts` and import it in both places):

   ```ts
   if (!isValidScriptName(name)) {
     throw new Error(`Refusing to write script with unsafe name "${name}".`);
   }
   ```

5. **Tests.** Add to the existing files (follow their patterns exactly):
   - In `src/services/script/discover.test.ts`:
     - `discoverScripts` returns `[]` when `<cwd>/.workhorse/scripts` does not exist (remove the `mkdirSync` for this one test by using a fresh tmpdir without it).
     - A script file with a malformed `#workhorse:args {not json` line is skipped while a valid sibling script still loads.
   - In `src/services/__tests__/script-service.test.ts`:
     - `ScriptService.setup()` succeeds on a cwd with no `.workhorse/scripts` dir and `list()` returns `[]`.
     - `write_script` with `name: "../escape"` resolves to `{ ok: false, error: <containing "Invalid script name"> }` and **no file named `escape.sh` exists anywhere under the tmpdir's parent** (assert `existsSync(join(cwd, "..", "escape.sh"))` is false, and `existsSync(join(cwd, SCRIPTS_DIR))` contains no such file).
     - `write_script` with a valid name still round-trips (existing tests already cover this — just keep them green).

6. **Verify**, from `packages/core-v2/`:

   ```bash
   bun test          # expected: 0 fail, total count increased by your new tests
   bun run typecheck # expected: exits 0, no output after the tsc banner
   bun run lint      # expected: 0 errors (warnings ≤ the pre-existing 8 plus none introduced by you)
   ```

## Out of scope

- `schema/script/*` (invocation/define/help) — error-contract changes there belong to plan 003.
- `SkillService` and skill discovery (its analogous loops already guard with `existsSync`).
- Any logging/telemetry facility for skipped files.
- The `run_script` tool.

## Done criteria (machine-checkable)

- [ ] `cd packages/core-v2 && bun test` exits 0, including the 5+ new tests named above
- [ ] `bun run typecheck` exits 0
- [ ] `bun run lint` reports 0 errors
- [ ] `grep -n "readdirSync(dir)" src/services/script/discover.ts` shows the call only inside an `existsSync` guard
- [ ] A manual spot-check: `grep -n "SCRIPT_NAME\|isValidScriptName" src/services/script` shows validation in both `tools/write.ts` (or via the shared helper) and `service.ts`

## Drift check

Before editing, confirm the excerpts above still match the files. If `discover.ts` already guards with `existsSync(dir)`, or `write.ts` already validates `name`, the corresponding step is done — skip it and note that in your report. If the files have been substantially restructured, STOP and report.

## Escape hatches

- If silently skipping bad script files breaks an existing test that asserts a throw, STOP and report — that would mean the all-or-nothing behavior was intentional and the design decision needs a human.
- If the 200-line limit is hit in `discover.ts`, extract `readScript` + helpers into a sibling file (one-word name, e.g. `read.ts`) re-exported via `index.ts` — do not suppress the lint rule.

## Maintenance note

Skipped-file silence is a stopgap: when a hooks-based or logger facility lands (orchestrator is still a stub), discovery should surface "N scripts skipped" diagnostics. The name validation regex is the single source of truth for what a script name is — if script namespacing changes (e.g. allowing `skill:name` in written scripts), update `isValidScriptName` and its tests together.
