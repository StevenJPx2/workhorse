// aft_edit — structural edit of a file (write-capable).
//
// Kept as its own tool, NOT folded into `aft`: it is the write half, and a
// stage allowlist is the capability gate. Granting read-only code intelligence
// must never imply the power to modify the tree.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { aft } from "./_shared";

export default tool({
  name: "aft_edit",
  description:
    "Structural edit of a file: find/replace, whole-symbol replace, or append. Tree-sitter " +
    "validated and backed up before writing. Subject to the stage's writeAllow gate.",
  docs: `
aft_edit — structural, validated file edits. Every edit is parse-checked and
backed up first, so a malformed change is rejected rather than written.

MODES (determined by which arguments you pass)

find/replace — oldString + newString
  Replaces exact text. Use replaceAll for every occurrence.
  An EMPTY newString is a DELETE, and is honored as such.

symbol replace — symbol + content
  Replaces an entire named symbol (function, class, type) including its
  decorators and doc comment. Cleaner than matching text when refactoring a
  whole function.
  An EMPTY content DELETES the symbol.

ARGUMENTS
  filePath    (required) the file to edit
  oldString   text to find
  newString   replacement ("" deletes)
  symbol      symbol to replace wholesale
  content     new symbol body ("" deletes)
  replaceAll  replace every occurrence of oldString

EXAMPLES

  { filePath: "src/app.ts", oldString: "const x = 1", newString: "const x = 2" }
  { filePath: "src/app.ts", oldString: "TODO: fix", newString: "", replaceAll: true }
  { filePath: "src/app.ts", symbol: "handleRequest",
    content: "function handleRequest() {\\n  return null;\\n}" }

NOTES
  Writing outside the stage's writeAllow globs is BLOCKED by the sandbox, not
  by this tool — the rejection comes back as an error string.
  After a batch of edits run { action: "inspect" } on \`aft\` to catch type
  errors before tests.
`,
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
      // != null, not truthiness: "" is a meaningful value (delete).
      ...(input.oldString != null ? ["--old", input.oldString] : []),
      ...(input.newString != null ? ["--new", input.newString] : []),
      ...(input.content != null ? ["--content", input.content] : []),
      ...(input.replaceAll ? ["--replace-all"] : []),
    ]),
});
