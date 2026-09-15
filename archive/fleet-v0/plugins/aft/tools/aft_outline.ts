// aft_outline — structural outline of a file or directory (read-only).
//
// `file` and `directory` are DISTINCT params in the protocol — passing a
// directory as `file` fails with "Is a directory". The tool keeps one `target`
// input and picks the right param, so the agent doesn't have to know which it
// has.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_outline",
  description:
    "Structural outline of a file or directory: symbols (functions, classes, types) with " +
    "line ranges, or a Markdown/HTML heading tree. Explore structure before reading with aft_zoom.",
  docs: `
aft_outline — structural map of a file or directory. Start here on unfamiliar
code.

ARGUMENTS
  target     (required) a file OR a directory path
  directory  set true when target is a directory (default: auto-detected by
             trying file first, then directory)

OUTPUT
  Source    → symbols (functions, classes, types) with line ranges
  Markdown  → the heading tree
  Directory → a file tree with each file's symbols nested beneath it

EXAMPLES

  { target: "src/app.ts" }
  { target: "src/api", directory: true }
  { target: "README.md" }

NOTES
  Outline first, then aft_zoom the symbol you actually need — reading a whole
  file to find one function wastes context.
`,
  input: v.object({
    target: v.string(),
    /** Force the directory param; omit to auto-detect. */
    directory: v.optional(v.boolean()),
  }),
  async run({ input, sandbox }) {
    if (input.directory) return aft(sandbox, "outline", { directory: input.target });

    // Auto-detect: try `file`, and on the specific "is a directory" failure
    // retry as `directory`. Cheaper than a stat round-trip, and the agent
    // usually doesn't know or care which it passed.
    const asFile = await aft(sandbox, "outline", { file: input.target });
    if (!/Is a directory|file not found/i.test(asFile)) return asFile;

    const asDir = await aft(sandbox, "outline", { directory: input.target });
    // If neither worked, the file-shaped error is the more useful one to report.
    return asDir.startsWith("aft outline failed") ? asFile : asDir;
  },
});
