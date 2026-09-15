// workhorse_find_workflow — semantic search over the fleet's workflow catalog
// (chat surface). Use BEFORE filing a ticket to pick the workflow that fits.

import { tool } from "@workhorse/api";
import * as v from "valibot";

export default tool({
  name: "workhorse_find_workflow",
  surfaces: ["chat"],
  description:
    "Semantic search over the fleet's available workflows. Use BEFORE " +
    "filing a ticket to pick the workflow whose shape fits the task, then pass its name to " +
    "workhorse_file_ticket. Returns ranked {name, description, stages}.",
  docs: `
workhorse_find_workflow — semantic search over available workflows.

ARGUMENTS
  query  (required) what the task needs, in plain words

OUTPUT
  Ranked { name, stages, description }.

EXAMPLES

  { query: "capture a screenshot of a page and open a PR" }
  { query: "fix a bug with tests and review" }

NOTES
  CALL THIS BEFORE workhorse_file_ticket so the ticket runs on the pipeline whose
  shape matches the work. Default to "coding" if nothing fits — no hits is a real
  answer, not a reason to re-query with variations.
`,
  input: v.object({ query: v.pipe(v.string(), v.description("What the task needs, e.g. 'take a screenshot and open a PR'")) }),
  async run({ input, core }) {
    const hits = await core.findWorkflows(input.query, 5);
    if (!hits.length) return "No workflows matched. Default to 'coding'.";
    return hits
      .map((h) => `- ${h.name}${h.stages ? ` [${h.stages}]` : ""}: ${h.description ?? ""}`)
      .join("\n");
  },
});
