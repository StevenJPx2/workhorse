// Fleet knowledge read path — the leaf module.
//
// Both the plugin (routes, hooks) and the search_fleet_knowledge tool need to
// query the index. Keeping the query side here, importing nothing from the
// plugin, means tools/ never has to reach back up into plugin.ts — which is
// what made plugin.ts → tools/index.ts → search_fleet_knowledge.ts → plugin.ts
// a cycle.

import type { Env } from "@workhorse/api";

/** AI Search instance id: built-in storage, items keyed `<ticket>-<run>.md`. */
const INSTANCE = "workhorse-fleet";

/** Get the fleet knowledge instance, creating it on first use. */
export async function instance(env: Env): Promise<AiSearchInstance | null> {
  if (!env.AI_SEARCH) return null;
  const inst = env.AI_SEARCH.get(INSTANCE);
  try {
    await inst.info();
    return inst;
  } catch {
    try {
      return await env.AI_SEARCH.create({
        id: INSTANCE,
        // Hybrid: verbatim identifiers (file paths, error strings) need
        // keyword hits; conceptual queries need vectors.
        index_method: { vector: true, keyword: true },
      });
    } catch (err) {
      console.warn("fleet knowledge instance create failed:", err);
      return null;
    }
  }
}

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
export async function searchKnowledge(
  env: Env,
  query: string,
  limit = 6,
): Promise<KnowledgeHit[]> {
  try {
    const inst = await instance(env);
    if (!inst) return [];
    const res = await inst.search({
      query,
      ai_search_options: {
        retrieval: { max_num_results: Math.min(Math.max(limit, 1), 20), context_expansion: 1 },
      },
    });
    const data = (res as { data?: Array<Record<string, unknown>> }).data ?? [];
    return data.map((chunk) => {
      const content = chunk.content as Array<{ text?: string }> | undefined;
      const attrs = chunk.attributes as { file?: Record<string, unknown> } | undefined;
      const file = attrs?.file ?? {};
      return {
        source: String(chunk.filename ?? file.filename ?? "unknown"),
        score: typeof chunk.score === "number" ? chunk.score : undefined,
        text: (content ?? []).map((c) => c.text ?? "").join("\n").slice(0, 2500),
        ticketId: typeof file.ticketId === "string" ? file.ticketId : undefined,
        repo: typeof file.repo === "string" ? file.repo : undefined,
      };
    });
  } catch (err) {
    console.warn("fleet knowledge search failed:", err);
    return [];
  }
}
