// aft_inspect — codebase health snapshot: diagnostics, TODOs, dead code (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_aft_shared";

export default tool({
  name: "aft_inspect",
  description:
    "Codebase health snapshot: diagnostics (compile/type errors), TODOs, dead code, unused " +
    "exports, duplicates. Run after edits and before tests/commit to catch errors early.",
  docs: "Baseline fixture — see the pre-consolidation tool for behavior.",
  input: v.object({ scope: v.optional(v.string()), sections: v.optional(v.array(v.string())) }),
  run: ({ input, sandbox }) =>
    aft(sandbox, [
      "inspect",
      "--json",
      ...(input.scope ? ["--scope", input.scope] : []),
      ...(input.sections?.length ? ["--sections", input.sections.join(",")] : []),
    ]),
});
