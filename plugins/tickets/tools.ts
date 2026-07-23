// Stage tool: on-demand context enrichment (flue engine, worker-side).
//
// The operator types a ref (a Jira key, a Slack link) in the task; dispatch
// records it under "## Available context" without inlining its body. The
// agent pulls the content only if it needs it — keeping big threads out of
// every prompt. Resolution goes through Core (the attachment provider owns
// the fetch), so the hard plugin boundary holds.

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory } from "@workhorse/api";
import * as v from "valibot";

export const ticketsTools: PluginToolFactory = ({ core }) => [
  defineTool({
    name: "fetch_context",
    description:
      "Fetch the content of a context reference the task lists under '## Available context' " +
      "(e.g. a Jira issue or Slack thread). Returns prompt-ready markdown. Use this to pull the " +
      "details of a referenced ticket/thread when they matter to the work — don't guess at them.",
    input: v.object({
      kind: v.pipe(v.string(), v.description("The ref kind, e.g. 'jira' or 'slack'")),
      ref: v.pipe(v.string(), v.description("The canonical ref id, e.g. 'PROJ-123'")),
    }),
    async run({ input }) {
      const resolved = await core.resolveAttachment(input.kind, input.ref);
      if (!resolved) return `Could not resolve ${input.kind}:${input.ref} (unknown kind or fetch failed).`;
      return `## ${resolved.title}${resolved.url ? ` (${resolved.url})` : ""}\n\n${resolved.content.slice(0, 6000)}`;
    },
  }),
];
