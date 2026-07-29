// search_fleet_knowledge — the fleet's institutional memory (AI Search over
// distilled traces of every past run). Dual-surface: stages use it to check
// prior art before solving; the fleet-chat operator agent uses it to answer
// "why did X fail?" / "have we done this before?".

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { searchKnowledge } from "../search";

export default tool({
  name: "search_fleet_knowledge",
  surfaces: ["stage", "chat"],
  description:
    "Search the fleet's institutional memory: distilled traces of every past Workhorse run " +
    "(task, per-stage analyses, verifier findings, escalations, outcome) across all repos and " +
    "tickets. Ask before solving: similar error messages, the same subsystem, prior attempts " +
    "at this kind of task. Complements memory_search (per-repo working memory) — this one sees " +
    "what OTHER tickets and repos learned.",
  docs: `
search_fleet_knowledge — the fleet's institutional memory.

Indexes a distilled trace of EVERY past Workhorse run across all repos and
tickets: the task, each stage's analysis, verifier findings, escalations, and
the final outcome. Hybrid vector + keyword search.

ARGUMENTS
  query  (required) natural language; an error message pasted verbatim works well
  limit  optional number of hits

WHEN TO USE
  Before solving a non-trivial problem — ask whether the fleet has already hit
  it. Highest value for:
    - an error message that looks like it has been seen before
    - a subsystem another ticket already touched
    - a recurring failure, BEFORE proposing a fix

  This complements memory_search: memory_search is THIS repo's working memory, while
  this sees what OTHER tickets and repos learned.

EXAMPLES

  { query: "TS2741 property docs missing valibot tool" }
  { query: "why did the sandbox lose node_modules mid-run" }
  { query: "prior attempts at consolidating plugin tools" }

No hits is a real answer — it means novel territory, so proceed on first
principles rather than re-querying with variations.
`,
  input: v.object({ query: v.string(), limit: v.optional(v.number()) }),
  async run({ input, env }) {
    const hits = await searchKnowledge(env, input.query.slice(0, 500), input.limit);
    if (!hits.length) return "No fleet knowledge hits — likely novel territory for the fleet.";
    return hits
      .map(
        (h, i) =>
          `### ${i + 1}. ${h.source}${h.repo ? ` (${h.repo})` : ""}${h.score !== undefined ? ` — score ${h.score.toFixed(2)}` : ""}\n${h.text}`,
      )
      .join("\n\n");
  },
});
