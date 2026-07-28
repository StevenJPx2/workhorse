// aft_outline — structural outline of a file or directory (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_aft_shared";

export default tool({
  name: "aft_outline",
  description:
    "Structural outline of a file or directory: symbols (functions, classes, types) with " +
    "line ranges, or a Markdown/HTML heading tree. Explore structure before reading with aft_zoom.",
  docs: "Baseline fixture — see the pre-consolidation tool for behavior.",
  input: v.object({ target: v.string(), files: v.optional(v.boolean()) }),
  run: ({ input, sandbox }) => aft(sandbox, ["outline", "--json", ...(input.files ? ["--files"] : []), input.target]),
});
