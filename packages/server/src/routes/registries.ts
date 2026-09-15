// Master-gated registries: agent blocks + workflows (user data, not core
// code) + admin maintenance.

import { json, type Route } from "../router";

export const registryRoutes: Route[] = [
  // ---- admin maintenance ----
  // POST /admin/backfill-d1 is gone: it was a one-time KV→D1 import that has
  // already run, and it was the highest-complexity function in the old db layer.
  {
    // Ops visibility: what a registries corpus instance actually holds.
    method: "GET",
    path: "/admin/registries",
    auth: "master",
    // fallow-ignore-next-line complexity
    handler: async ({ env, url }) => {
      const raw = url.searchParams.get("corpus") ?? "scripts";
      if (raw !== "scripts" && raw !== "workflows" && raw !== "tools") {
        return json({ error: "corpus must be scripts|workflows|tools" }, 400);
      }
      const kind = raw as "scripts" | "workflows" | "tools";
      const { registriesInstance } = await import("../aisearch");
      const inst = await registriesInstance(env, kind);
      if (!inst) return json({ error: "AI_SEARCH unavailable" }, 503);
      const [stats, list] = await Promise.allSettled([inst.stats(), inst.items.list()]);
      const items = list.status === "fulfilled" ? (list.value as { result?: Array<{ key?: string; name?: string }> }).result : null;
      return json({
        stats: stats.status === "fulfilled" ? stats.value : String(stats.reason),
        items: items ? items.map((i) => i.key ?? i.name ?? "?") : list.status === "rejected" ? String(list.reason) : "no items",
      });
    },
  },
  {
    // Rebuild the AI Search registries corpora (scripts from D1, workflows
    // from the catalog, tools from the static catalog). Runs upserts with
    // uploadAndPoll so the corpus is searchable when the route returns.
    method: "POST",
    path: "/admin/reindex-registries",
    auth: "master",
    handler: async ({ env, workflows }) => {
      const { reindexAll } = await import("../aisearch");
      return json(await reindexAll(env, workflows));
    },
  },

  // ---- agent blocks ----
  {
    method: "GET",
    path: "/agents",
    auth: "master",
    handler: async ({ env }) => {
      const { listAgentBlocks } = await import("../agents");
      return json({ agents: await listAgentBlocks(env) });
    },
  },
  {
    method: "*",
    path: /^\/agents\/([\w-]+)$/,
    auth: "master",
    async handler({ request, env, match }) {
      const { getAgentBlock, putAgentBlock, deleteAgentBlock } = await import("../agents");
      if (request.method === "GET") {
        const block = await getAgentBlock(env, match[1]);
        return block ? json({ agent: block }) : json({ error: "not found" }, 404);
      }
      if (request.method === "PUT") {
        const body = (await request.json().catch(() => null)) as {
          description?: string;
          tools?: string[];
          persona?: string;
        } | null;
        if (!body) return json({ error: "json body required" }, 400);
        const err = await putAgentBlock(env, {
          name: match[1],
          description: body.description ?? "",
          tools: body.tools ?? [],
          persona: body.persona ?? "",
          source: "user",
        });
        return err ? json({ error: err }, 422) : json({ ok: true });
      }
      if (request.method === "DELETE") {
        await deleteAgentBlock(env, match[1]);
        return json({ ok: true });
      }
      return json({ error: "method" }, 405);
    },
  },

  // ---- workflows (hard-coded defs; read-only) ----
  // Workflows are code, not user data — no upload/registry. These serve the
  // UI picker + read-only graph view from the static def manifests.
  {
    method: "GET",
    path: "/workflows",
    auth: "master",
     handler: async ({ workflows }) => json({ workflows: workflows ? await workflows.list() : [] }),
  },
  {
    method: "GET",
    path: /^\/workflows\/([\w-]+)$/,
    auth: "master",
     async handler({ match, workflows }) {
       const entry = await workflows?.get(match[1]);
       return entry ? json({ ...entry, readOnly: true }) : json({ error: "not found" }, 404);
    },
  },

  // ---- editor metadata (models + tool catalog for UI dropdowns) ----
  {
    method: "GET",
    path: "/meta/editor",
    auth: "master",
    async handler({ env: _env }) {
      const { TOOL_CATALOG } = await import("../aisearch");
      // ONE model plane: opencode-go / deepseek-v4-flash, fleet-wide.
      const models = ["deepseek-v4-flash"];
      return json({
        models,
        tools: TOOL_CATALOG.map((t) => ({
          name: t.name,
          classification: t.classification,
          description: t.description,
        })),
      });
    },
  },
];
