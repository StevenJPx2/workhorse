import * as v from "valibot";
import { tool } from "@workhorse/api";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 300_000;

export default tool({
  name: "bash",
  description: "Run a shell command in the workspace root. Returns stdout+stderr, with the exit code on failure.",
  docs: `
bash — a shell command in the workspace.

ARGUMENTS
  command  (required)
  timeout  optional ms (default 120000, capped at 300000)

EXAMPLES

  { command: "bun test" }
  { command: "git add -A && git diff --cached --stat" }
  { command: "bun run build", timeout: 300000 }

NOTES
  Output is the LAST 30 KiB, because a failing build's useful part is its end.
  A non-zero exit is reported with its code rather than thrown — read it and
  decide, don't assume success.

  Prefer a purpose-built tool where one exists (read, grep, find): they are
  cheaper and their output is already shaped for a prompt.
`,
  input: v.object({ command: v.string(), timeout: v.optional(v.number()) }),
  async run({ input, sandbox }) {
    const timeout = Math.min(input.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const r = await sandbox.exec(input.command, { timeout });

    // Tail, not head: a failing command's diagnosis is at the end.
    const out = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(-30_000);
    return r.exitCode === 0 ? out || "(exit 0, no output)" : `exit ${r.exitCode}\n${out}`;
  },
});
