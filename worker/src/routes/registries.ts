// Master-gated registries: agent blocks + workflows (user data, not core
// code) + the custodian token push + admin maintenance.

import type { Env } from "@workhorse/api";
import { workflowDef, workflowDefs } from "@workhorse/workflow";
import { backfillFromKV } from "../db";
import { json, type Route } from "../router";

export const registryRoutes: Route[] = [
  // ---- admin maintenance ----
  {
    method: "POST",
    path: "/admin/backfill-d1",
    auth: "master",
    handler: async ({ env }) => json(await backfillFromKV(env)),
  },
  {
    method: "POST",
    path: "/admin/reindex-semindex",
    auth: "master",
    handler: async ({ env }) => {
      const { reindexAll } = await import("../semindex");
      return json(await reindexAll(env));
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
    method: "POST",
    path: "/agents/seed",
    auth: "master",
    handler: async ({ env }) => {
      const { seedAgentBlocks } = await import("../agents");
      return json({ seeded: await seedAgentBlocks(env) });
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
    handler: async () =>
      json({
        workflows: Object.values(workflowDefs).map((d) => ({
          name: d.name,
          description: d.description,
          stageCount: d.stages.length,
        })),
      }),
  },
  {
    method: "GET",
    path: /^\/workflows\/([\w-]+)$/,
    auth: "master",
    async handler({ match }) {
      const d = workflowDef(match[1]);
      if (!d) return json({ error: "not found" }, 404);
      // Shape mirrors the old registry entry: a spec the graph view renders.
      return json({
        name: d.name,
        description: d.description,
        spec: { schemaVersion: 1, name: d.name, description: d.description, inputs: d.inputs, artifactGraph: { stages: d.stages } },
        readOnly: true,
      });
    },
  },

  // ---- custodian token push ----
  {
    method: "POST",
    path: "/token",
    auth: "master",
    async handler({ request, env }) {
      const { access, expires } = (await request.json()) as { access: string; expires: number };
      if (!access?.startsWith("sk-ant-oat")) return json({ error: "not an oauth access token" }, 400);
      await env.TICKETS.put("auth:access", JSON.stringify({ access, expires }));
      return json({ ok: true, expires });
    },
  },
  {
    // Credential health — freshness of the custodian OAuth token, never the
    // token itself. Powers the UI's model-credential tile so an expired token
    // (which silently 401s every run) is visible instead of a mystery.
    method: "GET",
    path: "/token",
    auth: "master",
    async handler({ env }) {
      const stored = await env.TICKETS.get("auth:access");
      if (!stored) return json({ present: false, state: "missing", minutesRemaining: null, expires: null });
      const { expires } = JSON.parse(stored) as { access: string; expires: number };
      const msLeft = (expires || 0) - Date.now();
      const minutesRemaining = expires ? Math.round(msLeft / 60000) : null;
      // expires=0 means "no runway info" — treat as usable (see fileTicket).
      const state = !expires ? "unknown" : msLeft <= 0 ? "expired" : msLeft < 10 * 60_000 ? "expiring" : "fresh";
      return json({ present: true, state, minutesRemaining, expires: expires || null });
    },
  },

  // ---- editor metadata (models + tool catalog for UI dropdowns) ----
  {
    method: "GET",
    path: "/meta/editor",
    auth: "master",
    async handler({ env: _env }) {
      const { TOOL_CATALOG } = await import("../semindex");
      // Models offered in the dispatch picker (primary → cheaper fallbacks).
      const models = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-1"];
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

export type { Env };
