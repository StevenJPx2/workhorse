import * as v from "valibot";
import { tool } from "@workhorse/api";
import { blockedMessage, writeAllowed } from "./_write-gate";

export default tool({
  name: "edit",
  description: "Replace an exact substring in a file (first occurrence). Subject to the stage's write policy.",
  docs: `
edit — replace an exact substring, first occurrence only.

ARGUMENTS
  path       (required)
  oldString  (required) must match EXACTLY, including whitespace
  newString  (required)

EXAMPLES

  { path: "src/app.ts", oldString: "const x = 1", newString: "const x = 2" }

NOTES
  Only the FIRST occurrence changes. To replace several, include enough
  surrounding context to make each oldString unique, and edit them one at a time.

  A missing file and an unmatched oldString are both reported rather than thrown —
  an unmatched string usually means the file differs from what you remember, so
  re-read before retrying.

  Mechanically gated by the stage's write policy.
`,
  input: v.object({ path: v.string(), oldString: v.string(), newString: v.string() }),
  async run({ input, sandbox, policy }) {
    if (!writeAllowed(input.path, policy)) return blockedMessage("edit", input.path, policy);

    const current = await sandbox.readFile(input.path);
    if (current == null) return `edit: file not found: ${input.path}`;
    if (!current.includes(input.oldString)) return `edit: oldString not found in ${input.path}`;

    await sandbox.writeFile(input.path, current.replace(input.oldString, input.newString));
    return `edited ${input.path}`;
  },
});
