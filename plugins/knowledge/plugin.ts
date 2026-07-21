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

import type { Env, WorkhorsePlugin } from "@workhorse/api";

const INSTANCE = "workhorse-fleet";

/** Get the fleet knowledge instance, creating it on first use. */
async function instance(env: Env): Promise<AiSearchInstance | null> {
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
  ticketId: string,
  runId: string,
  kind: string,
  activityJson: string,
): Promise<boolean> {
  try {
    const inst = await instance(env);
    if (!inst) return false;
    const rawTicket = await env.TICKETS.get(ticketId);
    const ticket = rawTicket ? (JSON.parse(rawTicket) as TicketMeta) : {};
    const escRaw = await env.TICKETS.get(`esc:${ticketId}:${runId}`);
    const doc = distillRun(
      ticketId,
      runId,
      kind,
      ticket,
      JSON.parse(activityJson) as TraceActivity,
      escRaw ? JSON.parse(escRaw) : undefined,
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
async function searchKnowledge(
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

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export const knowledgePlugin: WorkhorsePlugin = {
  id: "knowledge",

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
      async handler(_request, env) {
        let indexed = 0;
        let failed = 0;
        let cursor: string | undefined;
        do {
          const page = await env.TICKETS.list({ prefix: "trace:", cursor });
          for (const key of page.keys) {
            const raw = await env.TICKETS.get(key.name);
            if (!raw) continue;
            try {
              const t = JSON.parse(raw) as {
                ticketId: string;
                runId: string;
                kind: string;
                activity: unknown;
              };
              const ok = await indexRun(env, t.ticketId, t.runId, t.kind, JSON.stringify(t.activity));
              ok ? indexed++ : failed++;
            } catch {
              failed++;
            }
          }
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor);
        return json({ ok: true, indexed, failed });
      },
    },
  ],

  hooks: {
    // Fleet knowledge: distill + index every archived run so future agents
    // can find it. Best-effort by design (indexRun never throws).
    async onTraceArchived(env, _core, { ticketId, runId, kind, activityJson }) {
      await indexRun(env, ticketId, runId, kind, activityJson);
    },
  },
};
