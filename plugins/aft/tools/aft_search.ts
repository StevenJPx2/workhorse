// aft_search — AST-aware structural code search (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_search",
  description:
    "AST-aware structural code search across the workspace. Pattern is a code fragment with " +
    "meta-variables ($VAR one node, $$$ many). Language-aware; far more precise than grep.",
  docs: `
aft_search — AST-aware structural code search.

Matches code STRUCTURE, not text, so it finds calls and definitions regardless
of formatting or variable naming.

ARGUMENTS
  pattern  (required) a code fragment with meta-variables:
           $VAR matches ONE node, $$$ matches MANY
  lang     (required) typescript | tsx | javascript | python | rust | go | ...
  paths    optional paths to restrict the search

PATTERNS MUST BE COMPLETE AST NODES
  For a function, include params and body:
    "async function $NAME($$$) { $$$ }"      correct
    "async function $NAME"                   will not parse

EXAMPLES

  { pattern: "console.log($MSG)", lang: "typescript" }
  { pattern: "def $F($$$): $$$", lang: "python", paths: ["src"] }
  { pattern: "$X.unwrap()", lang: "rust" }

NOTES
  Prefer this over grep for anything structural. Use grep only for genuine text
  (a comment, a string literal, a log message).
`,
  input: v.object({ pattern: v.string(), lang: v.string(), paths: v.optional(v.array(v.string())) }),
  run: ({ input, sandbox }) =>
    aft(sandbox, ["search", "--json", "--lang", input.lang, "--pattern", input.pattern, ...(input.paths ?? [])]),
});
