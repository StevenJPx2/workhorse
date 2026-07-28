// aft_search — indexed regex code search (read-only).
//
// Backed by AFT's `grep` command. NOT AST-aware: an earlier version of this tool
// documented ast-grep meta-variables ($VAR, $$$) and a `lang` parameter, and
// neither exists. Verified against aft 0.42.0 and 0.49.0 — `defineTool($$$)`
// matches 0 results while the regex `defineTool|defineAgent` matches 22.
//
// Worse, AFT SILENTLY IGNORES unknown params, so `lang` was accepted and did
// nothing: the search looked scoped while searching everything. Only `path`
// actually narrows (220 files → 37 for path:"packages").

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft, type AftReply } from "./_shared";

export default tool({
  name: "aft_search",
  description:
    "Indexed regex search across the workspace, ranked and scoped. Use a regular expression " +
    "(alternation, anchors, character classes all work) and optionally a path to narrow it. " +
    "Faster and better-ranked than shelling out to grep.",
  docs: `
aft_search — indexed regex code search.

ARGUMENTS
  pattern  (required) a REGULAR EXPRESSION, not an AST pattern
  path     optional path prefix to narrow the search

PATTERNS ARE REGEX
  Alternation, anchors, and character classes all work:

    "defineTool|defineAgent"     either name
    "^export function"           anchored to line start
    "TODO:.*auth"                a TODO mentioning auth
    "\\\\bcreateFlueContext\\\\b"      word-bounded

  This is NOT ast-grep: meta-variables like $VAR and $$$ match LITERALLY and
  will find nothing. To match structure (a call with any arguments), use a
  regex that covers the literal text instead.

EXAMPLES

  { pattern: "defineTool" }
  { pattern: "export function \\\\w+Tool" }
  { pattern: "submit_work", path: "packages/workflow" }

NOTES
  Only \`path\` narrows the search. Unknown parameters are silently ignored by
  the backend, so a made-up filter will appear to work while searching
  everything.
`,
  input: v.object({
    pattern: v.string(),
    /** Path prefix to narrow the search. */
    path: v.optional(v.string()),
  }),
  run: ({ input, sandbox }) =>
    aft(
      sandbox,
      "grep",
      { pattern: input.pattern, ...(input.path ? { path: input.path } : {}) },
      renderMatches,
    ),
});

/** grep answers in `text`, with match counts alongside worth surfacing. */
function renderMatches(reply: AftReply): string {
  const text = typeof reply.text === "string" ? reply.text : "";
  if (!text) return "(no matches)";

  // Say so explicitly when the index was unavailable — a fallback scan can miss
  // files, and silently degraded results are worse than a noted caveat.
  const degraded = reply.index_status === "Fallback" ? "\n\n(index unavailable — scanned files directly)" : "";
  const truncated = reply.truncated === true ? "\n\n(results truncated)" : "";

  return `${text}${truncated}${degraded}`;
}
