// workhorse_file_ticket — the fleet-chat operator files a coding ticket.
// Chat surface: runs worker-side, calls Core.fileTicket directly.

import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "workhorse_file_ticket",
  surfaces: ["chat"],
  description:
    "File a coding ticket with the Workhorse fleet. An autonomous staged agent (plan → " +
    "implement → verify, per-stage tool gating) runs in an isolated cloud sandbox and opens a " +
    "GitHub PR. Use for well-scoped, small-to-medium code changes on a GitHub repo. Returns the " +
    "ticket id to watch with workhorse_ticket_status. Call workhorse_find_workflow first to pick " +
    "the workflow that fits the task.",
  docs: `
workhorse_file_ticket — dispatch new work to the fleet.

A staged agent runs in an isolated cloud sandbox with per-stage tool gating and
opens a GitHub PR.

ARGUMENTS
  repo      (required) GitHub repo URL or owner/name
  prompt    (required) the task: what to change, constraints, acceptance criteria
  title     optional short title
  workflow  optional workflow name (from workhorse_find_workflow)

Returns the ticket id — track it with workhorse_ticket_status.

WRITING THE PROMPT
  Write as if briefing a competent engineer who CANNOT ask follow-up questions.
  State the acceptance criteria explicitly; the agent cannot check back with you
  mid-run.

BEST FOR
  Well-scoped small-to-medium changes. A vague or sprawling brief produces a
  vague or sprawling PR.

EXAMPLE

  { repo: "acme/widgets",
    prompt: "Fix the login redirect loop when the session cookie is expired. Acceptance: a stale cookie lands on /login, not an infinite redirect.",
    workflow: "coding" }
`,
  input: v.object({
    repo: v.pipe(v.string(), v.description("GitHub repo URL or owner/name")),
    prompt: v.pipe(v.string(), v.description("The task: what to change, constraints, acceptance criteria")),
    title: v.optional(v.string()),
    workflow: v.optional(v.string()),
  }),
  async run({ input, core }) {
    const r = await core.fileTicket({ repo: input.repo, prompt: input.prompt, title: input.title, workflow: input.workflow });
    if (!r.ok) return `Could not file ticket: ${r.error}`;
    return `Ticket ${r.ticket.id} filed: "${r.ticket.title}". The fleet is on it — check with workhorse_ticket_status.`;
  },
});
