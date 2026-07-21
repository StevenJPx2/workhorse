// @workhorse/semindex — semantic search toolkit over Cloudflare primitives.
//
// One Vectorize index, namespaced per corpus; Workers AI embeddings
// (@cf/baai/bge-small-en-v1.5, 384 dims); metadata rides the vector. A
// registry defines its corpus once and calls upsert on write; consumers
// call query. Embedding, batching, and namespace hygiene live here.
//
// AI Search stays for the heavyweight managed-RAG corpus (fleet knowledge
// docs); semindex is for light structured registries — scripts, workflows,
// tools — where we own the chunking and want cheap exact control.

export interface SemIndexEnv {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}

export interface IndexDef<T> {
  /** Corpus name — the Vectorize namespace. */
  name: string;
  /** Stable id for an item (upserts replace by id). */
  id(item: T): string;
  /** The text that represents the item for embedding. */
  toText(item: T): string;
  /** Metadata stored on the vector (returned with hits, filterable). */
  metadata?(item: T): Record<string, string | number | boolean>;
}

export interface SemHit {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";
/** Vectorize upsert batch cap (stay well under the request limits). */
const BATCH = 100;

async function embed(env: SemIndexEnv, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  // Workers AI batches up to 100 inputs per call.
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const res = (await env.AI.run(EMBED_MODEL, { text: slice })) as { data: number[][] };
    out.push(...res.data);
  }
  return out;
}

export function defineIndex<T>(def: IndexDef<T>) {
  return {
    name: def.name,

    /** Insert-or-replace items (embeds + upserts, batched). Never throws. */
    async upsert(env: SemIndexEnv, items: T[]): Promise<number> {
      try {
        if (items.length === 0) return 0;
        const vectors = await embed(env, items.map((i) => def.toText(i).slice(0, 2000)));
        const rows = items.map((item, i) => ({
          id: `${def.name}:${def.id(item)}`,
          values: vectors[i],
          namespace: def.name,
          metadata: { ...(def.metadata?.(item) ?? {}), _id: def.id(item) },
        }));
        for (let i = 0; i < rows.length; i += BATCH) {
          await env.VECTORIZE.upsert(rows.slice(i, i + BATCH));
        }
        return items.length;
      } catch (err) {
        console.warn(`semindex upsert(${def.name}) failed:`, err);
        return 0;
      }
    },

    /** Remove items by their (unprefixed) ids. Never throws. */
    async remove(env: SemIndexEnv, ids: string[]): Promise<void> {
      try {
        if (ids.length) await env.VECTORIZE.deleteByIds(ids.map((i) => `${def.name}:${i}`));
      } catch (err) {
        console.warn(`semindex remove(${def.name}) failed:`, err);
      }
    },

    /** Semantic query; hits carry metadata + score. Never throws (empty on error). */
    async query(env: SemIndexEnv, text: string, opts: { topK?: number } = {}): Promise<SemHit[]> {
      try {
        const [vector] = await embed(env, [text.slice(0, 2000)]);
        const res = await env.VECTORIZE.query(vector, {
          topK: opts.topK ?? 5,
          namespace: def.name,
          returnMetadata: "all",
        });
        return res.matches.map((m) => ({
          id: String(m.metadata?._id ?? m.id),
          score: m.score,
          metadata: m.metadata ?? {},
        }));
      } catch (err) {
        console.warn(`semindex query(${def.name}) failed:`, err);
        return [];
      }
    },
  };
}
