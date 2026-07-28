// aft_edit — structural edit of a file (write-capable; rides the writeAllow gate).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_aft_shared";

export default tool({
  name: "aft_edit",
  description:
    "Structural edit of a file: find/replace, line-range replace, or whole-symbol replace. " +
    "Tree-sitter validated; backs up before writing. Subject to the stage's writeAllow gate.",
  docs: "Baseline fixture — see the pre-consolidation tool for behavior.",
  input: v.object({
    filePath: v.string(),
    oldString: v.optional(v.string()),
    newString: v.optional(v.string()),
    symbol: v.optional(v.string()),
    content: v.optional(v.string()),
    replaceAll: v.optional(v.boolean()),
  }),
  run: ({ input, sandbox }) =>
    aft(sandbox, [
      "edit",
      "--json",
      "--file",
      input.filePath,
      ...(input.symbol ? ["--symbol", input.symbol] : []),
      ...(input.oldString != null ? ["--old", input.oldString] : []),
      ...(input.newString != null ? ["--new", input.newString] : []),
      ...(input.content != null ? ["--content", input.content] : []),
      ...(input.replaceAll ? ["--replace-all"] : []),
    ]),
});
