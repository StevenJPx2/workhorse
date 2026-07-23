// Master-gated registries: agent blocks + workflows (user data, not core
// code) + the custodian token push + admin maintenance.

import type { Env } from "@workhorse/api";
import { backfillFromKV } from "../db";
import { NAME_RE, deleteWorkflow, getWorkflow, listWorkflows, putWorkflow, seedWorkflows } from "../workflows";
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

  // ---- workflow registry ----
  {
    method: "GET",
    path: "/workflows",
    auth: "master",
    handler: async ({ env }) => json({ workflows: await listWorkflows(env) }),
  },
  {
    method: "POST",
    path: "/workflows/seed",
    auth: "master",
    handler: async ({ env }) => json(await seedWorkflows(env)),
  },
  {
    method: "*",
    path: /^\/workflows\/([\w-]+)$/,
    auth: "master",
    async handler({ request, env, match }) {
      if (!NAME_RE.test(match[1])) return json({ error: "bad name" }, 400);
      if (request.method === "GET") {
        const entry = await getWorkflow(env, match[1]);
        return entry ? json(entry) : json({ error: "not found" }, 404);
      }
      if (request.method === "PUT") {
        const body = (await request.json().catch(() => null)) as {
          spec?: Record<string, unknown>;
          agents?: Record<string, string>;
          schemas?: Record<string, string>;
        } | null;
        if (!body?.spec) return json({ error: "spec required" }, 400);
        const err = await putWorkflow(env, match[1], {
          spec: body.spec,
          agents: body.agents,
          schemas: body.schemas,
        });
        if (err) return json({ error: err }, 422);
        return json({ ok: true, name: match[1] });
      }
      if (request.method === "DELETE") {
        const entry = await getWorkflow(env, match[1]);
        if (!entry) return json({ error: "not found" }, 404);
        await deleteWorkflow(env, match[1]);
        return json({ ok: true });
      }
      return json({ error: "method" }, 405);
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
      const { PROMOTION_CHAIN } = await import("../model-chains");
      const { TOOL_CATALOG } = await import("../semindex");
      return json({
        models: PROMOTION_CHAIN,
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
