// workhorse — the fleet operator's tool (chat surface only).
//
// All five actions share one surface and one trust level: the fleet-chat agent
// talks to the operator, and filing work is its primary job. So unlike aft and
// browser there is no capability line to split on here — the chat/stage surface
// boundary already does the gating, and stages never see this tool.

import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "workhorse",
  surfaces: ["chat"],
  description:
    "Command the Workhorse fleet: list (all tickets), status (one ticket), diff (a finished " +
    "ticket's patch), find_workflow (pick the pipeline that fits a task), file (dispatch new " +
    "work). Filing runs an autonomous staged agent in a cloud sandbox that opens a GitHub PR.",
  docs: `
workhorse — fleet control for the operator agent.

ACTIONS

list — every ticket, newest first (id, status, title, PR url).
  No arguments. Capped at 25.

status — one ticket's full record.
  id  (required) ticket id
  Returns status, branch, PR url, error (if it failed), and result.
  This is what to call when the operator asks "how's X going?".

diff — the persisted git patch of a finished ticket.
  id  (required) ticket id
  Only available after a run has produced a diff.

find_workflow — semantic search over available workflows.
  query  (required) what the task needs, in plain words
  Returns ranked { name, stages, description }. CALL THIS BEFORE file so the
  ticket runs on the pipeline whose shape matches the work; default to
  "coding" if nothing fits.

file — dispatch new work to the fleet.
  repo      (required) GitHub repo URL or owner/name
  prompt    (required) the task: what to change, constraints, acceptance criteria
  title     optional short title
  workflow  optional workflow name (from find_workflow)
  Returns the ticket id. A staged agent runs in an isolated sandbox with
  per-stage tool gating and opens a PR. Best for well-scoped small-to-medium
  changes. Write the prompt as if briefing a competent engineer who cannot ask
  follow-up questions.

EXAMPLES

  { action: "list" }
  { action: "status", id: "t-abc123" }
  { action: "diff", id: "t-abc123" }
  { action: "find_workflow", query: "capture a screenshot of a page and open a PR" }
  { action: "file", repo: "acme/widgets", prompt: "Fix the login redirect loop when the session cookie is expired. Acceptance: a stale cookie lands on /login, not an infinite redirect.", workflow: "coding" }
`,
  input: v.object({
    action: v.picklist(["list", "status", "diff", "find_workflow", "file"]),
    /** Ticket id for status/diff. */
    id: v.optional(v.string()),
    /** Search text for find_workflow. */
    query: v.optional(v.string()),
    // file
    repo: v.optional(v.string()),
    prompt: v.optional(v.string()),
    title: v.optional(v.string()),
    workflow: v.optional(v.string()),
  }),
  async run({ input, core }) {
    switch (input.action) {
      case "list": {
        const tickets = await core.listTickets();
        if (!tickets.length) return "No tickets yet.";
        return tickets
          .slice(0, 25)
          .map((t) => `${t.id}  [${t.status}]  ${t.title}${t.prUrl ? `  → ${t.prUrl}` : ""}  (${t.updatedAt})`)
          .join("\n");
      }

      case "status": {
        if (!input.id) return 'workhorse: action "status" needs a ticket id.';
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
      }

      case "diff": {
        if (!input.id) return 'workhorse: action "diff" needs a ticket id.';
        const diff = await core.ticketDiff(input.id);
        if (!diff) return `No diff persisted for ${input.id}.`;
        return diff.slice(0, 20_000);
      }

      case "find_workflow": {
        if (!input.query) return 'workhorse: action "find_workflow" needs a query.';
        const hits = await core.findWorkflows(input.query, 5);
        if (!hits.length) return "No workflows matched. Default to 'coding'.";
        return hits.map((h) => `- ${h.name}${h.stages ? ` [${h.stages}]` : ""}: ${h.description ?? ""}`).join("\n");
      }

      case "file": {
        if (!input.repo || !input.prompt) return 'workhorse: action "file" needs repo and prompt.';
        const r = await core.fileTicket({
          repo: input.repo,
          prompt: input.prompt,
          title: input.title,
          workflow: input.workflow,
        });
        if (!r.ok) return `Could not file ticket: ${r.error}`;
        return `Ticket ${r.ticket.id} filed: "${r.ticket.title}". The fleet is on it — check with { action: "status", id: "${r.ticket.id}" }.`;
      }
    }
  },
});
