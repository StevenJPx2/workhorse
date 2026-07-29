// Per-repo agent memory, on AI Search.
//
// This replaces Magic Context. The mechanism it replaces was: restore a ~MB
// SQLite database from R2 into every sandbox at prepare, let an embedded ONNX
// model (~90MB, baked into the image) index locally, then WAL-checkpoint and
// base64 the whole file back out after the run. Per ticket.
//
// Why it goes:
//   - Workhorse's staging model makes a stage's context FRESH by design, so the
//     long-conversation memory Magic Context exists to provide has no consumer.
//   - The round-trip is per-ticket I/O proportional to the repo's whole memory,
//     not to what the run actually needs.
//   - AI Search already serves fleet knowledge in this worker. A second retrieval
//     stack with its own embedding model, storage format, and failure modes buys
//     nothing the first one doesn't do.
//
// What replaces it is a per-repo NAMESPACE in the same AI Search instance: an
// agent writes a memory, and a later agent on the same repo retrieves the
// relevant ones by query — rather than being handed the entire database and
// expected to find them.

import { repoSlug } from "@workhorse/api";
import type { Env } from "@workhorse/api";
import { instance, query, str } from "./query";

/** A durable fact an agent recorded about a repo. */
export interface RepoMemory {
  /** Stable per-repo slug, so every sandbox for a repo reads the same memories. */
  repo: string;
  /** What kind of fact this is — the categories match the agents' vocabulary. */
  category: MemoryCategory;
  /** One standalone fact, phrased to make sense without the session that wrote it. */
  content: string;
  /** Which ticket recorded it, for provenance. */
  ticketId?: string;
  createdAt: string;
}

export const MEMORY_CATEGORIES = [
  "PROJECT_RULES",
  "ARCHITECTURE",
  "CONSTRAINTS",
  "CONFIG_VALUES",
  "NAMING",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// `repoSlug` now lives in @workhorse/api — it is repo identity, not a memory
// concern, and keeping it here made @workhorse/sandbox depend on this PLUGIN just
// to build a dependency-cache key.

/** Filename for one memory. The `mem/<repo>/` prefix is what scopes retrieval. */
function memoryKey(repo: string, createdAt: string, content: string): string {
  // Content hash rather than a counter: writing the same fact twice should
  // replace it, not accumulate near-duplicates that crowd out real results.
  let hash = 0;
  for (let i = 0; i < content.length; i++) hash = (hash * 31 + content.charCodeAt(i)) | 0;
  const id = Math.abs(hash).toString(36);

  return `mem/${repoSlug(repo)}/${createdAt.slice(0, 10)}-${id}.md`;
}

/** Render a memory as the document AI Search indexes. */
function renderMemory(memory: RepoMemory): string {
  return [
    `# ${memory.category}`,
    "",
    `- repo: ${repoSlug(memory.repo)}`,
    ...(memory.ticketId ? [`- recorded by ticket: ${memory.ticketId}`] : []),
    `- recorded: ${memory.createdAt}`,
    "",
    memory.content,
  ].join("\n");
}

/**
 * Record a memory for a repo. Never throws — losing a memory must not fail a run.
 * Returns whether it landed, so a tool can tell the agent honestly.
 */
export async function writeMemory(env: Env, memory: RepoMemory): Promise<boolean> {
  try {
    const inst = await instance(env);
    if (!inst) return false;

    // items.upload, matching the fleet-knowledge write path — same instance, same
    // API. A filename collision REPLACES, which is what makes re-recording the
    // same fact idempotent rather than additive.
    await inst.items.upload(memoryKey(memory.repo, memory.createdAt, memory.content), renderMemory(memory), {
      metadata: {
        kind: "memory",
        repo: repoSlug(memory.repo),
        category: memory.category,
        ticketId: memory.ticketId ?? "",
        context: `Durable memory about the ${repoSlug(memory.repo)} repository`,
      },
    });

    return true;
  } catch (err) {
    console.warn(`memory write failed for ${memory.repo}:`, err);
    return false;
  }
}

export interface MemoryHit {
  category: string;
  content: string;
  ticketId?: string;
  score?: number;
}

/**
 * Retrieve a repo's memories relevant to a query.
 *
 * Scoped by the `repo` attribute, so one repo's conventions never surface as
 * another's. An unavailable index reads as "no memories" rather than an error —
 * a stage that cannot reach memory should still do its work.
 */
export async function searchMemory(env: Env, repo: string, query_: string, limit = 8): Promise<MemoryHit[]> {
  const chunks = await query(env, query_, {
    limit,
    // Scoped by BOTH kind and repo. Without the repo filter another project's
    // conventions would surface as this one's — the worst failure this plane can
    // have, because the answer looks authoritative.
    filters: {
      type: "and",
      filters: [
        { type: "eq", key: "kind", value: "memory" },
        { type: "eq", key: "repo", value: repoSlug(repo) },
      ],
    },
    maxChars: 2000,
  });

  return chunks.map((c) => ({
    category: str(c.attributes, "category") ?? "UNKNOWN",
    content: c.text,
    ticketId: str(c.attributes, "ticketId"),
    score: c.score,
  }));
}
