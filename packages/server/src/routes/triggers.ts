// Trigger registry routes + the generic fire endpoint.

import type { Env, TriggerRecord } from "@workhorse/api";
import { bearer, safeEqual } from "@workhorse/auth";
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

/** Build a trigger record from a PUT body, preserving creation provenance. */
function draftFrom(name: string, body: Partial<TriggerRecord>, existing: TriggerRecord | null): TriggerRecord {
  return {
    name,
    source: body.source ?? "webhook",
    schedule: body.schedule,
    template: body.template ?? "",
    workflow: body.workflow,
    repo: body.repo,
    inputs: body.inputs,
    attachments: body.attachments,
    enabled: body.enabled ?? true,
    // createdAt and lastFiredAt survive an edit: overwriting them would reset the
    // sweep's dedupe and re-fire a trigger that already ran.
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    lastFiredAt: existing?.lastFiredAt,
  };
}

/** Create or replace one trigger. */
async function putOne(request: Request, env: Env, name: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<TriggerRecord> | null;
  if (!body) return json({ error: "json body required" }, 400);

  const rec = draftFrom(name, body, await getTrigger(env, name));

  const err = validateTrigger(rec);
  if (err) return json({ error: err }, 422);

  await putTrigger(env, rec);
  return json({ ok: true, trigger: rec });
}

/**
 * May this request fire a trigger?
 *
 * Two ways in: the fleet master bearer, or a shared secret in the query string
 * for webhook senders that cannot set headers. Both compared in constant time —
 * `===` short-circuits at the first differing byte, which leaks how much of a
 * guessed prefix was right.
 */
function mayFire(request: Request, env: Env, url: URL): boolean {
  if (env.SPIKE_TOKEN && safeEqual(bearer(request.headers.get("authorization")), env.SPIKE_TOKEN)) {
    return true;
  }

  const want = env.TRIGGER_SECRET ?? "";
  return Boolean(want) && safeEqual(url.searchParams.get("secret") ?? "", want);
}

/**
 * Flatten a JSON webhook body into template values.
 *
 * Scalars only — a nested object has no sensible {{slot}} rendering, and the
 * whole body is preserved as {{input}} regardless.
 */
function firePayload(body: Record<string, unknown>): Record<string, string> {
  const payload: Record<string, string> = {};

  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") payload[k] = String(v);
  }

  payload.input ??= JSON.stringify(body).slice(0, 2000);
  return payload;
}

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
      const name = match[1];
      if (!TRIGGER_NAME_RE.test(name)) return json({ error: "bad name" }, 400);

      if (request.method === "GET") {
        const t = await getTrigger(env, name);
        return t ? json({ trigger: t }) : json({ error: "not found" }, 404);
      }

      if (request.method === "PUT") return putOne(request, env, name);

      if (request.method === "DELETE") {
        await deleteTrigger(env, name);
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
    async handler({ request, env, url, match, intake }) {
      if (!mayFire(request, env, url)) return new Response("unauthorized", { status: 401 });

      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const r = await fireTrigger(intake, env, match[1], firePayload(body));

      return r.ok ? json({ ok: true, ticket: r.ticket.id }) : json({ error: r.error }, r.status);
    },
  },
];
