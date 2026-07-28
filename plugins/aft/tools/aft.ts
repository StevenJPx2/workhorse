// aft — the READ-ONLY half of AFT code intelligence, one tool, many actions.
//
// Split from aft_edit on the capability line: a read-only stage (planner,
// reviewer) gets structural understanding without any write power. Everything
// here is safe to grant to a stage that must not touch the tree.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft",
  description:
    "Bashless code intelligence over the workspace: outline (structure of a file/dir), zoom (full " +
    "source of one symbol), search (AST-aware structural search), inspect (diagnostics, TODOs, " +
    "dead code). Precise and token-cheap — prefer these over cat/grep/find. To EDIT, use aft_edit.",
  docs: `
aft — read-only code intelligence. Indexed and language-aware; far cheaper and
more precise than shelling out to cat/grep/find.

ACTIONS

outline — structural map. Start here on unfamiliar code.
  target  (required) a file, a directory, or a URL
  files   list files (with language + symbol counts) instead of symbols;
          target must be a directory
  For source: symbols (functions, classes, types) with line ranges.
  For Markdown/HTML: the heading tree.

zoom — read one symbol's full source, or one doc section.
  filePath      (required) the file
  symbol        (required) symbol name, or a Markdown/HTML heading
  contextLines  lines of surrounding context
  Use after outline instead of reading a whole file.

search — AST-aware structural search.
  pattern  (required) a code fragment with meta-variables:
           $VAR matches one node, $$$ matches many
  lang     (required) typescript | tsx | javascript | python | rust | go | ...
  paths    optional paths to restrict the search
  Patterns must be complete AST nodes. For a function, include params and
  body: "async function $NAME($$$) { $$$ }" — not just the signature.

inspect — codebase health snapshot.
  scope     optional path to restrict to
  sections  optional detail categories: todos, diagnostics, dead_code,
            unused_exports, duplicates
  Run after a batch of edits and BEFORE tests/commit — it surfaces compile
  and type errors early. Treat dead_code as a hint, not proof: symbols
  reached only via dynamic dispatch can be false positives.

EXAMPLES

  { action: "outline", target: "src/api" }
  { action: "outline", target: "src", files: true }
  { action: "zoom",    filePath: "src/app.ts", symbol: "handleRequest" }
  { action: "search",  pattern: "console.log($MSG)", lang: "typescript" }
  { action: "search",  pattern: "def $F($$$): $$$", lang: "python", paths: ["src"] }
  { action: "inspect", scope: "src", sections: ["diagnostics"] }

A failed command returns a readable error string rather than raising, so a
missing file or bad pattern is reported, not fatal.
`,
  input: v.object({
    action: v.picklist(["outline", "zoom", "search", "inspect"]),
    // outline
    target: v.optional(v.string()),
    files: v.optional(v.boolean()),
    // zoom
    filePath: v.optional(v.string()),
    symbol: v.optional(v.string()),
    contextLines: v.optional(v.number()),
    // search
    pattern: v.optional(v.string()),
    lang: v.optional(v.string()),
    paths: v.optional(v.array(v.string())),
    // inspect
    scope: v.optional(v.string()),
    sections: v.optional(v.array(v.string())),
  }),
  run({ input, sandbox }) {
    switch (input.action) {
      case "outline": {
        if (!input.target) return Promise.resolve('aft: action "outline" needs a target (file, directory, or URL).');
        return aft(sandbox, ["outline", "--json", ...(input.files ? ["--files"] : []), input.target]);
      }

      case "zoom": {
        if (!input.filePath || !input.symbol) {
          return Promise.resolve('aft: action "zoom" needs filePath and symbol.');
        }
        return aft(sandbox, [
          "zoom",
          "--json",
          "--file",
          input.filePath,
          "--symbol",
          input.symbol,
          ...(input.contextLines ? ["--context", String(input.contextLines)] : []),
        ]);
      }

      case "search": {
        if (!input.pattern || !input.lang) {
          return Promise.resolve('aft: action "search" needs pattern and lang.');
        }
        return aft(sandbox, [
          "search",
          "--json",
          "--lang",
          input.lang,
          "--pattern",
          input.pattern,
          ...(input.paths ?? []),
        ]);
      }

      case "inspect":
        return aft(sandbox, [
          "inspect",
          "--json",
          ...(input.scope ? ["--scope", input.scope] : []),
          ...(input.sections?.length ? ["--sections", input.sections.join(",")] : []),
        ]);
    }
  },
});
