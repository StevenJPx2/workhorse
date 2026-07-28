import * as v from "valibot";
import { tool } from "@workhorse/api";
import { blockedMessage, writeAllowed } from "./_write-gate";

export default tool({
  name: "write",
  description: "Create or overwrite a file. Subject to the stage's write policy.",
  docs: `
write — create or OVERWRITE a whole file.

ARGUMENTS
  path     (required)
  content  (required) the complete new contents

EXAMPLES

  { path: "src/new-module.ts", content: "export const x = 1;\\n" }

NOTES
  This replaces the file entirely. To change part of one, use edit — a write
  built from a partially-remembered file is how content gets silently lost.

  Mechanically gated: a path outside the stage's write policy is refused, and the
  refusal names the policy.
`,
  input: v.object({ path: v.string(), content: v.string() }),
  async run({ input, sandbox, policy }) {
    if (!writeAllowed(input.path, policy)) return blockedMessage("write", input.path, policy);

    await sandbox.writeFile(input.path, input.content);
    return `wrote ${input.path} (${input.content.length} bytes)`;
  },
});
