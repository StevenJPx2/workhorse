// The shared AI Search read path.
//
// Both corpora in this instance — fleet knowledge (distilled run traces) and
// per-repo memory — need the same four things: bound the result count, run the
// query, flatten the chunk shape, and degrade to no-results rather than throwing.
// Only the FILTER and the per-hit mapping differ, so those are what a caller
// supplies.

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

/** Retrieval bounds. More than 20 hits does not fit a stage's prompt usefully. */
const MIN_RESULTS = 1;
const MAX_RESULTS = 20;

/** One search result, flattened out of AI Search's chunk shape. */
export interface Chunk {
  /** The indexed document's filename. */
  filename: string;
  /** Relevance, when the backend reported one. */
  score?: number;
  /** The chunk's text, joined across its parts. */
  text: string;
  /** Metadata stored at upload, under `attributes.file`. */
  attributes: Record<string, unknown>;
}

export interface QueryOptions {
  limit?: number;
  /** AI Search filter expression, scoping which documents may match. */
  filters?: unknown;
  /** Include neighbouring chunks of a matched document. */
  contextExpansion?: number;
  /** Per-chunk text cap. */
  maxChars?: number;
}

/**
 * Query the instance and return flattened chunks.
 *
 * Never throws: a stage that cannot reach the index should still do its work, and
 * every caller here treats "unavailable" and "nothing matched" identically.
 */
export async function query(env: Env, q: string, options: QueryOptions = {}): Promise<Chunk[]> {
  const { limit = 6, filters, contextExpansion, maxChars = 2500 } = options;

  try {
    const inst = await instance(env);
    if (!inst) return [];

    const res = await inst.search({
      query: q,
      ai_search_options: {
        retrieval: {
          max_num_results: Math.min(Math.max(limit, MIN_RESULTS), MAX_RESULTS),
          ...(contextExpansion ? { context_expansion: contextExpansion } : {}),
        },
      },
      ...(filters ? { filters } : {}),
    } as never);

    const data = (res as { data?: Array<Record<string, unknown>> }).data ?? [];

    return data.map((chunk) => {
      const parts = (chunk.content as Array<{ text?: string }> | undefined) ?? [];
      const attributes = (chunk.attributes as { file?: Record<string, unknown> } | undefined)?.file ?? {};

      return {
        filename: String(chunk.filename ?? attributes.filename ?? "unknown"),
        score: typeof chunk.score === "number" ? chunk.score : undefined,
        text: parts
          .map((p) => p.text ?? "")
          .join("\n")
          .slice(0, maxChars),
        attributes,
      };
    });
  } catch (err) {
    console.warn(`AI Search query failed (${q.slice(0, 60)}):`, err);
    return [];
  }
}

/** Read a string attribute, or undefined when absent or the wrong type. */
export function str(attributes: Record<string, unknown>, key: string): string | undefined {
  const v = attributes[key];
  return typeof v === "string" && v ? v : undefined;
}
