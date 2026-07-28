// workhorse_ticket_status — one ticket's record + live workflow state (chat surface).
import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "workhorse_ticket_status",
  surfaces: ["chat"],
  description: "Get one Workhorse ticket: record (status, branch, result, PR) — plus its error if it failed.",
  docs: `
workhorse_ticket_status — one ticket's full record.

ARGUMENTS
  id  (required) the ticket id

OUTPUT
  status, branch, PR url, error (if it failed), and result.

EXAMPLE

  { id: "t-abc123" }

NOTES
  This is what to call when the operator asks "how is X going?". If it failed,
  the error field says why.
`,
  input: v.object({ id: v.string() }),
  async run({ input, core }) {
    const t = await core.getTicket(input.id);
    if (!t) return `No ticket ${input.id}.`;
    return [
      `id: ${t.id}`,
      `title: ${t.title}`,
      `status: ${t.status}`,
      t.branch ? `branch: ${t.branch}` : null,
      t.prUrl ? `PR: ${t.prUrl}` : null,
      t.error ? `error: ${t.error}` : null,
      t.result ? `\nresult:\n${String(t.result).slice(0, 2000)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  },
});
