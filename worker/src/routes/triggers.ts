// Trigger registry routes + the generic fire endpoint.

import type { TriggerRecord } from "@workhorse/api";
import {
  TRIGGER_NAME_RE,
  deleteTrigger,
  fireTrigger,
  getTrigger,
  listTriggers,
  putTrigger,
  validateTrigger,
} from "../triggers";
import { json, type Route } from "../router";

export const triggerRoutes: Route[] = [
  {
    method: "GET",
    path: "/triggers",
    auth: "master",
    handler: async ({ env }) => json({ triggers: await listTriggers(env) }),
  },
  {
    method: "*",
    path: /^\/triggers\/([a-z0-9-]+)$/,
    auth: "master",
    async handler({ request, env, match }) {
      if (!TRIGGER_NAME_RE.test(match[1])) return json({ error: "bad name" }, 400);
      if (request.method === "GET") {
        const t = await getTrigger(env, match[1]);
        return t ? json({ trigger: t }) : json({ error: "not found" }, 404);
      }
      if (request.method === "PUT") {
        const body = (await request.json().catch(() => null)) as Partial<TriggerRecord> | null;
        if (!body) return json({ error: "json body required" }, 400);
        const existing = await getTrigger(env, match[1]);
        const rec: TriggerRecord = {
          name: match[1],
          source: body.source ?? "webhook",
          schedule: body.schedule,
          template: body.template ?? "",
          workflow: body.workflow,
          repo: body.repo,
          inputs: body.inputs,
          attachments: body.attachments,
          enabled: body.enabled ?? true,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          lastFiredAt: existing?.lastFiredAt,
        };
        const err = validateTrigger(rec);
        if (err) return json({ error: err }, 422);
        await putTrigger(env, rec);
        return json({ ok: true, trigger: rec });
      }
      if (request.method === "DELETE") {
        await deleteTrigger(env, match[1]);
        return json({ ok: true });
      }
      return json({ error: "method" }, 405);
    },
  },
  {
    // Generic firing surface: secret-gated per trigger via ?secret= (the
    // fleet bearer also works). Body fields land in the template.
    method: "POST",
    path: /^\/triggers\/([a-z0-9-]+)\/fire$/,
    auth: "public",
    async handler({ request, env, url, match }) {
      const auth = request.headers.get("authorization") ?? "";
      const master = auth === `Bearer ${env.SPIKE_TOKEN}`;
      if (!master) {
        // Webhook-style: constant-time shared-secret query param.
        const got = url.searchParams.get("secret") ?? "";
        const want = env.TRIGGER_SECRET ?? "";
        if (!want || got.length !== want.length) return new Response("unauthorized", { status: 401 });
        let diff = 0;
        for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
        if (diff !== 0) return new Response("unauthorized", { status: 401 });
      }
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          payload[k] = String(v);
        }
      }
      payload.input ??= JSON.stringify(body).slice(0, 2000);
      const r = await fireTrigger(env, match[1], payload);
      return r.ok ? json({ ok: true, ticket: r.ticket.id }) : json({ error: r.error }, r.status);
    },
  },
];
