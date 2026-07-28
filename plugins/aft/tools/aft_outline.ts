// aft_outline — structural outline of a file or directory (read-only).
import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_outline",
  description:
    "Structural outline of a file or directory: symbols (functions, classes, types) with " +
    "line ranges, or a Markdown/HTML heading tree. Explore structure before reading with aft_zoom.",
  docs: `
aft_outline — structural map of a file, directory, or URL. Start here on
unfamiliar code.

ARGUMENTS
  target  (required) a file, a directory, or a URL
  files   list files (with language + symbol counts) instead of symbols;
          target must be a directory

OUTPUT
  Source      → symbols (functions, classes, types) with line ranges
  Markdown    → the heading tree
  HTML/URL    → the heading tree

EXAMPLES

  { target: "src/api" }
  { target: "src/app.ts" }
  { target: "src", files: true }
  { target: "https://docs.example.com/guide" }

NOTES
  Outline first, then aft_zoom the symbol you actually need — reading a whole
  file to find one function wastes context.
`,
  input: v.object({ target: v.string(), files: v.optional(v.boolean()) }),
  run: ({ input, sandbox }) => aft(sandbox, ["outline", "--json", ...(input.files ? ["--files"] : []), input.target]),
});
