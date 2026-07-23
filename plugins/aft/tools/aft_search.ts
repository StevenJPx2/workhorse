// aft_search — AST-aware structural code search (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_search",
  description:
    "AST-aware structural code search across the workspace. Pattern is a code fragment with " +
    "meta-variables ($VAR one node, $$$ many). Language-aware; far more precise than grep.",
  input: v.object({ pattern: v.string(), lang: v.string(), paths: v.optional(v.array(v.string())) }),
  run: ({ input, sandbox }) =>
    aft(sandbox, ["search", "--json", "--lang", input.lang, "--pattern", input.pattern, ...(input.paths ?? [])]),
});
