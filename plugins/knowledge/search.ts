// Fleet knowledge read path.
//
// Both the plugin (routes, hooks) and the search_fleet_knowledge tool need this,
// and neither may reach up into plugin.ts — that import was the cycle
// plugin.ts → tools/index.ts → search_fleet_knowledge.ts → plugin.ts.
//
// The generic query mechanics live in ./query, which both corpora share.

import type { Env } from "@workhorse/api";
import { query, str } from "./query";

export interface KnowledgeHit {
  source: string;
  score?: number;
  text: string;
  ticketId?: string;
  repo?: string;
}

/**
 * Search fleet knowledge. Returns compact hits for tool consumption.
 * Never throws — an unavailable index reads as "no results".
 */
export async function searchKnowledge(env: Env, q: string, limit = 6): Promise<KnowledgeHit[]> {
  // context_expansion: a run trace's useful answer often sits in the chunk NEXT
  // to the one that matched.
  const chunks = await query(env, q, { limit, contextExpansion: 1 });

  return chunks.map((c) => ({
    source: c.filename,
    score: c.score,
    text: c.text,
    ticketId: str(c.attributes, "ticketId"),
    repo: str(c.attributes, "repo"),
  }));
}
