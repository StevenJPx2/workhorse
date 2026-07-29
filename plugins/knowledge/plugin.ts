// Fleet knowledge plane: AI Search (AutoRAG) over the fleet's own history.
//
// Magic Context = the agent's working memory (per-repo, curated by agents).
// AI Search = fleet-wide institutional knowledge: every archived run is
// distilled into a compact markdown document (task, repo, stage analyses,
// verifier verdict, escalations, outcome) and indexed. Agents get a
// search_fleet_knowledge tool ("has the fleet seen this before?") and the
// fleet chat can answer "why did X fail last week?" from the same corpus.
//
// Instance: "workhorse-fleet" in the default namespace, BUILT-IN storage
// (no R2 to manage) — items upserted by filename `<ticket>-<run>.md`.

import type { Core, Env, WorkhorsePlugin } from "@workhorse/api";
import { instance } from "./query";
import { searchKnowledge } from "./search";
import { knowledgeTools } from "./tools";

export { searchKnowledge } from "./search";
export { repoSlug, searchMemory, writeMemory, MEMORY_CATEGORIES } from "./memory";
export type { MemoryCategory, MemoryHit, RepoMemory } from "./memory";
export type { KnowledgeHit } from "./search";

interface TraceActivity {
  status?: string;
  usage?: { totalTokens?: number; costUsd?: number };
  tasks?: Array<{
    id: string;
    status: string;
    prompt?: string | null;
    analysis?: string | null;
    output?: string | null;
  }>;
}

interface TicketMeta {
  title?: string;
  repo?: string;
  prompt?: string;
  status?: string;
  prUrl?: string;
}

/**
 * Distill one archived run into a compact, searchable markdown document.
 * Analyses are the gold (the agent's own account of what it did and hit);
 * prompts/outputs are truncated context.
 */
export function distillRun(
  ticketId: string,
  runId: string,
  kind: string,
  ticket: TicketMeta,
  activity: TraceActivity,
  escalations?: Array<{ trigger: string; detail: string; stage?: string; toModel?: string }>,
): string {
  const lines: string[] = [
    `# ${ticket.title ?? ticketId}`,
    "",
    `- ticket: ${ticketId}`,
    `- run: ${runId} (${kind})`,
    `- repo: ${ticket.repo ?? "unknown"}`,
    `- run status: ${activity.status ?? "unknown"}`,
    ...(ticket.prUrl ? [`- pr: ${ticket.prUrl}`] : []),
    ...(ticket.status ? [`- ticket status: ${ticket.status}`] : []),
    "",
    "## Task",
    "",
    (ticket.prompt ?? "").slice(0, 2000) || "(unknown)",
  ];
  for (const t of activity.tasks ?? []) {
    lines.push("", `## Stage: ${t.id} — ${t.status}`);
    if (t.analysis) lines.push("", t.analysis.slice(0, 5000));
    else if (t.output) lines.push("", "```", t.output.slice(-1500), "```");
  }
  if (escalations?.length) {
    lines.push("", "## Escalations");
    for (const e of escalations) {
      lines.push(
        `- ${e.trigger}${e.stage ? ` on ${e.stage}` : ""}${e.toModel ? ` → ${e.toModel}` : ""}: ${e.detail}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Index one archived run into fleet knowledge. Upsert by filename, so
 * re-archiving a run replaces its document. Never throws — knowledge
 * indexing must not fail a ticket.
 */
async function indexRun(
  env: Env,
  ticket: TicketMeta,
  ticketId: string,
  runId: string,
  kind: string,
  activityJson: string,
  escalations?: Array<{ trigger: string; detail: string; stage?: string; toModel?: string }>,
): Promise<boolean> {
  try {
    const inst = await instance(env);
    if (!inst) return false;
    const doc = distillRun(
      ticketId,
      runId,
      kind,
      ticket,
      JSON.parse(activityJson) as TraceActivity,
      escalations,
    );
    await inst.items.upload(`${ticketId}-${runId}.md`, doc, {
      metadata: { ticketId, runId, kind, repo: ticket.repo ?? "", context: `Workhorse run trace for ticket "${ticket.title ?? ticketId}"` },
    });
    return true;
  } catch (err) {
    console.warn(`fleet knowledge index failed for ${ticketId}:${runId}:`, err);
    return false;
  }
}

/** One archived trace, as stored in R2 or legacy KV. */
interface TraceBody {
  ticketId: string;
  runId: string;
  kind: string;
  activity: unknown;
  escalations?: Array<{ trigger: string; detail: string; stage?: string; toModel?: string }>;
}

export interface ReindexResult {
  indexed: number;
  failed: number;
}

/**
 * Re-index every archived trace into fleet knowledge.
 *
 * Extracted from the route handler so it is testable: it paginates two stores,
 * de-duplicates across them, and must survive a single corrupt trace — none of
 * which was reachable while it was an inline closure.
 *
 * Idempotent, because indexing upserts by filename.
 */
/** Every archived trace body in R2, page by page. */
async function* r2Traces(env: Env): AsyncGenerator<string> {
  let cursor: string | undefined;
  do {
    const page = await env.BLOBS.list({ prefix: "trace/", cursor });
    for (const obj of page.objects) {
      const body = await env.BLOBS.get(obj.key);
      if (body) yield await body.text();
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** Every archived trace body in legacy KV (pre-R2 runs), page by page. */
async function* kvTraces(env: Env): AsyncGenerator<string> {
  let cursor: string | undefined;
  do {
    const page = await env.TICKETS.list({ prefix: "trace:", cursor });
    for (const key of page.keys) {
      const raw = await env.TICKETS.get(key.name);
      if (raw) yield raw;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

export async function reindexAll(env: Env, core: Pick<Core, "getTicket">): Promise<ReindexResult> {
  const result: ReindexResult = { indexed: 0, failed: 0 };
  // Traces exist in BOTH stores for runs that straddled the blob migration, so
  // without this a re-index would double-count them.
  const seen = new Set<string>();

  const indexOne = async (raw: string) => {
    try {
      const trace = JSON.parse(raw) as TraceBody;
      const key = `${trace.ticketId}:${trace.runId}`;
      if (seen.has(key)) return;
      seen.add(key);

      const ticket = (await core.getTicket(trace.ticketId)) ?? {};
      const ok = await indexRun(
        env,
        ticket,
        trace.ticketId,
        trace.runId,
        trace.kind,
        JSON.stringify(trace.activity),
        trace.escalations,
      );

      if (ok) result.indexed++;
      else result.failed++;
    } catch {
      // One unparseable trace must not abort a backfill over thousands.
      result.failed++;
    }
  };

  // R2 first — authoritative since the blob plane — then legacy KV.
  for (const source of [r2Traces(env), kvTraces(env)]) {
    for await (const raw of source) await indexOne(raw);
  }

  return result;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export const knowledgePlugin: WorkhorsePlugin = {
  id: "knowledge",
  tools: knowledgeTools,

  routes: [
    {
      // Sandbox agents ask "has the fleet seen this before?". Scoped token:
      // sandboxes run untrusted repo code — never give them the master bearer.
      method: "POST",
      path: "/knowledge/search",
      auth: "scoped",
      async handler(request, env) {
        const { query, limit } = (await request.json().catch(() => ({}))) as {
          query?: string;
          limit?: number;
        };
        if (!query?.trim()) return json({ error: "query required" }, 400);
        const hits = await searchKnowledge(env, query.trim().slice(0, 500), limit);
        return json({ hits });
      },
    },
    {
      // Backfill from the existing trace archive (idempotent: items upsert
      // by filename). Master token only.
      method: "POST",
      path: "/knowledge/reindex",
      auth: "master",
      async handler(_request, env, _ctx, core) {
        return json({ ok: true, ...(await reindexAll(env, core)) });
      },
    },
  ],

  hooks: {
    // Fleet knowledge: distill + index every archived run so future agents
    // can find it. Best-effort by design (indexRun never throws).
    async onTraceArchived(env, core, { ticketId, runId, kind, activityJson, escalations }) {
      const ticket = (await core.getTicket(ticketId)) ?? {};
      await indexRun(env, ticket, ticketId, runId, kind, activityJson, escalations);
    },
  },
};
