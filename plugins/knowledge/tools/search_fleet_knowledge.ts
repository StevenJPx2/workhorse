// search_fleet_knowledge — the fleet's institutional memory (AI Search over
// distilled traces of every past run). Dual-surface: stages use it to check
// prior art before solving; the fleet-chat operator agent uses it to answer
// "why did X fail?" / "have we done this before?".

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { searchKnowledge } from "../plugin";

export default tool({
  name: "search_fleet_knowledge",
  surfaces: ["stage", "chat"],
  description:
    "Search the fleet's institutional memory: distilled traces of every past Workhorse run " +
    "(task, per-stage analyses, verifier findings, escalations, outcome) across all repos and " +
    "tickets. Ask before solving: similar error messages, the same subsystem, prior attempts " +
    "at this kind of task. Complements ctx_search (per-repo working memory) — this one sees " +
    "what OTHER tickets and repos learned.",
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
