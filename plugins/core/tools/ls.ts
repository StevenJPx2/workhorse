import * as v from "valibot";
import { tool } from "@workhorse/api";
import { cap, q } from "./_shared";

export default tool({
  name: "ls",
  description: "List a directory's contents (ls -la).",
  docs: `
ls — one directory's entries, with permissions, size, and mtime.

ARGUMENTS
  path  optional; defaults to the workspace root

EXAMPLES

  {}
  { path: "src/components" }

NOTES
  One level only. To search a tree use find (by name) or grep (by content).
`,
  input: v.object({ path: v.optional(v.string()) }),
  async run({ input, sandbox }) {
    const r = await sandbox.exec(`ls -la ${q(input.path ?? ".")}`);
    return cap(r.stdout, 20_000);
  },
});
