// memory_search — this repo's accumulated conventions and constraints.
//
// Replaces Magic Context's ctx_search. The difference that matters: Magic Context
// shipped the whole per-repo database into the sandbox and searched it locally
// (~90MB embedding model baked into the image, MB of SQLite restored per ticket).
// This queries the same AI Search instance the fleet knowledge uses, scoped to the
// repo — so a stage retrieves the handful of memories relevant to its work instead
// of being handed everything and expected to find them.

import { tool } from "@workhorse/api";
import * as v from "valibot";
import { searchMemory } from "../memory";

export default tool({
  name: "memory_search",
  description:
    "Search THIS repo's accumulated memory: rules, architecture facts, constraints, config values, " +
    "and naming conventions that previous agents recorded while working here. Check it before " +
    "guessing at a convention or re-deriving something the fleet already learned about this repo. " +
    "Complements search_fleet_knowledge, which spans every repo.",
  docs: `
memory_search — durable facts about THIS repository.

Every memory here was written by an agent that worked on this repo, via
memory_write. Categories: PROJECT_RULES, ARCHITECTURE, CONSTRAINTS,
CONFIG_VALUES, NAMING.

ARGUMENTS
  query  (required) natural language, e.g. "how are migrations applied"
  limit  optional hit count (default 8, max 20)

WHEN TO USE
  - Before assuming a convention: "what is the test command", "where do types live"
  - Before debugging something non-obvious: a previous agent may have recorded the
    cause as a CONSTRAINT
  - When a config value or path is not obvious from the code

WHEN NOT TO USE
  - To read code. Use read/grep/aft_outline — memory holds facts ABOUT the repo,
    not its contents.
  - For cross-repo experience. That is search_fleet_knowledge.

NOTES
  Scoped to this ticket's repo, so another project's conventions cannot surface
  here. An unavailable index returns no results rather than an error — a stage
  that cannot reach memory should still do its work.
`,
  input: v.object({
    query: v.string(),
    limit: v.optional(v.number()),
  }),
  async run({ input, env, ticket }) {
    if (!ticket.repo) return "memory_search: no repo in this context.";

    const hits = await searchMemory(env, ticket.repo, input.query, input.limit ?? 8);
    if (!hits.length) return "No memories recorded for this repo match that query.";

    return hits
      .map((h) => {
        const provenance = h.ticketId ? ` (ticket ${h.ticketId})` : "";
        return `## ${h.category}${provenance}\n${h.content}`;
      })
      .join("\n\n");
  },
});
