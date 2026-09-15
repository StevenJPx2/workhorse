import * as v from "valibot";
import { tool } from "@workhorse/api";
import { cap, q } from "./_shared";

export default tool({
  name: "grep",
  description: "Search file contents with a regex, recursively.",
  docs: `
grep — find files by CONTENT. Case-insensitive extended regex, recursive.

ARGUMENTS
  pattern  (required) an extended regex
  path     optional root; defaults to the workspace root

EXAMPLES

  { pattern: "createFlueContext" }
  { pattern: "TODO|FIXME", path: "src" }

NOTES
  Capped at 200 matching lines. For structural queries ("every call to this
  function") prefer aft_search, which understands syntax rather than text.
`,
  input: v.object({ pattern: v.string(), path: v.optional(v.string()) }),
  async run({ input, sandbox }) {
    const r = await sandbox.exec(`grep -rniE ${q(input.pattern)} ${q(input.path ?? ".")} 2>/dev/null | head -200`);
    return cap(r.stdout, 30_000) || "(no matches)";
  },
});
