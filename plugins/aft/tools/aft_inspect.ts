// aft_inspect — codebase health snapshot: diagnostics, TODOs, dead code (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_inspect",
  description:
    "Codebase health snapshot: diagnostics (compile/type errors), TODOs, dead code, unused " +
    "exports, duplicates. Run after edits and before tests/commit to catch errors early.",
  docs: `
aft_inspect — codebase health snapshot. THE way to catch compile and type errors
before running tests.

ARGUMENTS
  scope     optional path to restrict to
  sections  optional detail categories:
            todos, diagnostics, dead_code, unused_exports, duplicates

WHEN TO RUN
  After a batch of edits and BEFORE tests or commit. Diagnostics surface
  compile/type errors early, which is much cheaper than discovering them in a
  failing test run.

EXAMPLES

  {}
  { scope: "src" }
  { scope: "src/api", sections: ["diagnostics"] }
  { sections: ["dead_code", "unused_exports"] }

NOTES
  Treat dead_code as a HINT, not proof: symbols reached only via dynamic
  dispatch, or referenced only in type position, can be false positives. Verify
  before deleting.
`,
  input: v.object({ scope: v.optional(v.string()), sections: v.optional(v.array(v.string())) }),
  run: ({ input, sandbox }) =>
    aft(sandbox, [
      "inspect",
      "--json",
      ...(input.scope ? ["--scope", input.scope] : []),
      ...(input.sections?.length ? ["--sections", input.sections.join(",")] : []),
    ]),
});
