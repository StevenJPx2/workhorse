// fetch_context — on-demand context enrichment (stage surface).
//
// The operator types a ref (a Jira key, a Slack link) in the task; dispatch
// records it under "## Available context" without inlining its body. The agent
// pulls the content only if it needs it — keeping big threads out of every
// prompt. Resolution goes through Core (the attachment provider owns the
// fetch), so the hard plugin boundary holds.

import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "fetch_context",
  description:
    "Fetch the content of a context reference the task lists under '## Available context' " +
    "(e.g. a Jira issue or Slack thread). Returns prompt-ready markdown. Use this to pull the " +
    "details of a referenced ticket/thread when they matter to the work — don't guess at them.",
  docs: `
fetch_context — pull the body of a context ref the task mentions.

The task prompt lists refs under "## Available context" WITHOUT their content,
so a large Jira thread doesn't ride along in every stage's prompt. This tool
fetches one on demand.

ARGUMENTS
  kind  the ref kind — "jira", "slack", "repo", … (as listed in the task)
  ref   the canonical id — e.g. "PROJ-123", a Slack thread ref

EXAMPLES

  { kind: "jira",  ref: "PROJ-123" }
  { kind: "slack", ref: "C123:1700000000.123" }

Returns prompt-ready markdown (title, url, content, truncated at 6000 chars).
Never guess at a referenced ticket's content — fetch it. An unknown kind or a
failed fetch is reported, not thrown.
`,
  input: v.object({
    kind: v.pipe(v.string(), v.description("The ref kind, e.g. 'jira' or 'slack'")),
    ref: v.pipe(v.string(), v.description("The canonical ref id, e.g. 'PROJ-123'")),
  }),
  async run({ input, core }) {
    const resolved = await core.resolveAttachment(input.kind, input.ref);
    if (!resolved) return `Could not resolve ${input.kind}:${input.ref} (unknown kind or fetch failed).`;
    return `## ${resolved.title}${resolved.url ? ` (${resolved.url})` : ""}\n\n${resolved.content.slice(0, 6000)}`;
  },
});
