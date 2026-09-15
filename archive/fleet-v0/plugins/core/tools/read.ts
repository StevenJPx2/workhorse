import * as v from "valibot";
import { tool } from "@workhorse/api";
import { cap } from "./_shared";

export default tool({
  name: "read",
  description: "Read a file from the workspace. Returns its full text.",
  docs: `
read — a file's full contents.

ARGUMENTS
  path  (required) absolute, or relative to the workspace root

EXAMPLES

  { path: "src/index.ts" }
  { path: "/workspace/repo/package.json" }

NOTES
  Output is capped at 100 KiB. For a large file, prefer aft_outline to see its
  shape and aft_zoom to read one symbol — reading a whole file to find one
  function is the most common way a stage wastes its context.
`,
  input: v.object({ path: v.string() }),
  async run({ input, sandbox }) {
    const content = await sandbox.readFile(input.path);
    return content == null ? `read: file not found: ${input.path}` : cap(content, 100_000);
  },
});
