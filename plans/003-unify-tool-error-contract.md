# 003 — Unify the tool error contract: tools never throw, always return ToolResult

- **Status:** TODO
- **Written against:** commit `95f4cd7` (dirty working tree at audit time — see Drift check)
- **Effort:** S–M · **Risk:** medium-low (deliberate behavior change to `defineTool`; two existing tests assert the old behavior and must be updated)
- **Depends on:** 001 (CI gating). **Should land before** 002 and 005 (they write error-path code that follows this contract).

## Why

Tools in core-v2 have **two error channels** for the same class of failure:

- `run_script` called with an unknown script name returns `{ ok: false, error: 'No script named "nope".' }` — the `ToolResultT` channel.
- `run_script` called with a missing required argument **throws** (`resolveInvocation` raises a raw `Error`), and `defineTool` itself lets Zod input-validation **throw** out of `execute`.

The future Harness (and any standalone-service consumer) would have to wrap every tool call in try/catch _and_ check `ok` — and an LLM-facing tool runner that forgets the try/catch crashes the workflow on a malformed tool call, which is an everyday event with LLMs. The fix: make `defineTool`'s wrapper the single enforcement point — **a tool's `execute` never rejects; every failure becomes `{ ok: false, error }`**.

## Current state (verbatim excerpts — verify before editing)

`packages/core-v2/src/schema/tool/define.ts` (entire file):

```ts
import type z from "zod";

import { Tool, type ToolT } from "./schema";

export function defineTool<I extends z.ZodType = z.ZodType>(spec: ToolT<I>) {
  const { execute, input, ...rest } = spec;

  return Tool.parse({
    ...rest,

    execute: async (args, ctx) => {
      let parsed = args;

      if (input !== undefined) {
        parsed = input.parse(args); // ← throws ZodError out of the tool
      }

      return await execute(parsed as z.infer<I>, ctx);
    },

    input,
  } as ToolT<I>) as ToolT<I>;
}
```

`packages/core-v2/src/schema/script/invoke.ts` throws at lines 20 and 34 (`Missing required …`, `Unknown option …`). `run_script` (`src/services/script/tools/run.ts`) calls `script.run(resolveInvocation(script, …), ctx)` inside its `execute` — so those throws currently escape the tool.

The `ToolResult` shape (`src/schema/tool/result.ts`):

```ts
export const ToolResult = z.object({
  error: z.string().optional(),
  ok: z.boolean(),
  output: z.string().optional(),
});
```

**Existing tests that assert the old behavior:**

- `src/schema/tool/define.test.ts` — test `"rejects args that do not match \`input\`"`ends with`await expect(tool.execute({ name: 42 } as any, ctx)).rejects.toThrow();`→ must change to expect a resolved`{ ok: false, ... }`.
- `src/schema/script/__tests__/invoke.test.ts` — three tests assert `resolveInvocation` throws (`Missing required argument "src"`, `Missing required option "out"`, `Unknown option "nope"`). **These stay as-is**: `resolveInvocation` is a library function, not a tool; throwing is its contract. Only the tool boundary changes.

## Repo conventions (follow these)

- Bun runtime; `bun test` from `packages/core-v2/`; tests import from `"vitest"`.
- Zod v4, imported as `import z from "zod"`. Zod v4 provides `z.prettifyError(error)` for human-readable validation messages.
- oxlint: function declarations for named functions; alphabetized object keys; files ≤ 200 lines.
- Path-alias imports (`#schema`), index-only imports.

## Steps

1. **Make `defineTool`'s wrapper catch everything.** Replace the `execute` wrapper in `src/schema/tool/define.ts` with:

   ```ts
   execute: async (args, ctx) => {
     try {
       let parsed = args;

       if (input !== undefined) {
         parsed = input.parse(args);
       }

       return await execute(parsed as z.infer<I>, ctx);
     } catch (error) {
       return { error: describeError(error), ok: false };
     }
   },
   ```

   And add a function declaration in the same file (or a sibling if the 200-line limit threatens — it won't here):

   ```ts
   import z from "zod"; // note: changes from `import type z` — z is now used as a value

   function describeError(error: unknown): string {
     if (error instanceof z.ZodError) {
       return z.prettifyError(error);
     }
     if (error instanceof Error) {
       return error.message;
     }
     return String(error);
   }
   ```

   (If `z.prettifyError` does not exist in the installed zod version — check with step 4's typecheck — fall back to `error.message`.)

2. **Update the contract documentation.** In `src/schema/tool/schema.ts`, extend the `Tool` schema's surrounding context with a doc comment on `execute` (or on the `Tool` const) stating: _"`execute` never rejects: input-validation failures and thrown errors are converted to `{ ok: false, error }` by `defineTool`."_

3. **Update the one stale test.** In `src/schema/tool/define.test.ts`, change the second test:

   ```ts
   it("returns ok:false when args do not match `input`", async () => {
     const tool = defineTool({ ...same spec as before... });
     const result = await tool.execute({ name: 42 } as any, ctx);
     expect(result.ok).toBe(false);
     expect(result.error).toBeTruthy();
   });
   ```

4. **Add new contract tests** in `src/schema/tool/define.test.ts`:
   - A tool whose `execute` throws (`execute: () => { throw new Error("boom"); }` — adapt to satisfy the async type, e.g. `execute: () => Promise.reject(new Error("boom"))`) resolves to `{ error: "boom", ok: false }`.
   - A tool whose `execute` rejects with a non-Error (`Promise.reject("nope")`) resolves to `{ error: "nope", ok: false }`.

   And in `src/services/__tests__/script-service.test.ts` (follow the existing `contributedTools()` pattern):
   - `run_script` invoked with a script that has a required positional, but **without** that positional, resolves to `{ ok: false }` with `error` matching `/Missing required argument/u` — it must **not** reject.

5. **Verify**, from `packages/core-v2/`:

   ```bash
   bun test          # expected: 0 fail; the updated + new tests pass
   bun run typecheck # expected: exits 0
   bun run lint      # expected: 0 errors
   ```

## Out of scope

- `resolveInvocation` / `invoke.ts` — its throwing contract is correct for a library function; do not change it or its tests.
- `defineScript` (`schema/script/define.ts`) — already returns `{ ok: false }` results for non-zero exits; unchanged.
- Adding timeout/truncation handling to the wrapper (that's Harness territory per the design docs).
- Any service or tool source beyond the one new test in `script-service.test.ts`.

## Done criteria (machine-checkable)

- [ ] `cd packages/core-v2 && bun test` exits 0
- [ ] `bun run typecheck` exits 0; `bun run lint` reports 0 errors
- [ ] `grep -c "rejects.toThrow" src/schema/tool/define.test.ts` returns 0
- [ ] `grep -n "catch" src/schema/tool/define.ts` shows the wrapper's catch block
- [ ] The three throw-assertions in `src/schema/script/__tests__/invoke.test.ts` are **unchanged** (`git diff --stat` should not list that file)

## Drift check

Before editing, confirm `define.ts` matches the excerpt (no try/catch present). If a catch already exists, this plan is done or superseded — STOP and report. If `defineTool`'s signature changed (e.g. generics reworked), STOP and report rather than adapting the design.

## Escape hatches

- If `z.prettifyError` is unavailable at the installed zod version, use `error.message` for ZodError too — do not add a dependency.
- If converting throws to results breaks more than the one listed test, list the failures and STOP — that signals other call sites depend on rejection and the contract decision needs revisiting.

## Maintenance note

This wrapper is now the **single enforcement point** of the tool contract; when the Harness is built it can rely on `execute` never rejecting. Anyone adding a tool must construct it via `defineTool` (never hand-roll the object), or the guarantee silently disappears — worth a lint rule eventually. Plan 002's error returns and plan 005's registry changes assume this contract.
