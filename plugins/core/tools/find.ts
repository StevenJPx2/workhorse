import * as v from "valibot";
import { tool } from "@workhorse/api";
import { cap, q } from "./_shared";

export default tool({
  name: "find",
  description: "Find files by name or glob under a path.",
  docs: `
find — locate files by NAME. For contents, use grep.

ARGUMENTS
  pattern  (required) a filename glob, e.g. "*.test.ts"
  path     optional root; defaults to the workspace root

EXAMPLES

  { pattern: "*.test.ts" }
  { pattern: "wrangler.*", path: "worker" }

NOTES
  Capped at 200 matches. A pattern matches the FILENAME, not the full path, so
  "src/*.ts" will not work — pass path: "src" with pattern: "*.ts".
`,
  input: v.object({ pattern: v.string(), path: v.optional(v.string()) }),
  async run({ input, sandbox }) {
    const r = await sandbox.exec(`find ${q(input.path ?? ".")} -name ${q(input.pattern)} 2>/dev/null | head -200`);
    return cap(r.stdout, 20_000) || "(no matches)";
  },
});
