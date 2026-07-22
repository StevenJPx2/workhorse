// Stage tools: fleet knowledge (flue engine).
//
// The flue port of extension.ts. Runs worker-side, so it calls
// searchKnowledge (the AI Search query) directly instead of round-tripping
// the /knowledge/search callback. One tool: search_fleet_knowledge queries
// the fleet's institutional memory — distilled traces of every past run
// (task, per-stage analyses, verifier findings, escalations, outcome)
// across all repos and tickets. Complements Magic Context (per-repo working
// memory); this sees what OTHER tickets and repos learned.

import { defineTool } from "@flue/runtime";
import type { PluginToolFactory } from "@workhorse/api";
import * as v from "valibot";
import { searchKnowledge } from "./plugin";

export const knowledgeTools: PluginToolFactory = ({ env }) => [
  defineTool({
    name: "search_fleet_knowledge",
    description:
      "Search the fleet's institutional memory: distilled traces of every past Workhorse run " +
      "(task, per-stage analyses, verifier findings, escalations, outcome) across all repos and " +
      "tickets. Ask before solving: similar error messages, the same subsystem, prior attempts " +
      "at this kind of task. Complements ctx_search (per-repo working memory) — this one sees " +
      "what OTHER tickets and repos learned.",
    input: v.object({ query: v.string(), limit: v.optional(v.number()) }),
    async run({ input }) {
      const hits = await searchKnowledge(env, input.query.slice(0, 500), input.limit);
      if (!hits.length) return "No fleet knowledge hits — likely novel territory for the fleet.";
      return hits
        .map(
          (h, i) =>
            `### ${i + 1}. ${h.source}${h.repo ? ` (${h.repo})` : ""}${h.score !== undefined ? ` — score ${h.score.toFixed(2)}` : ""}\n${h.text}`,
        )
        .join("\n\n");
    },
  }),
];
