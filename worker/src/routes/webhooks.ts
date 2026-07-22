// POST /webhooks/:source — per-plugin signature verification, then either
// a bespoke handle() or the generic parse → events → wake pipeline.

import { appendEvents, wakeTicket } from "../events";
import { coreFor, pluginFor } from "../plugins";
import { json, type Route } from "../router";

export const webhookRoutes: Route[] = [
  {
    method: "POST",
    path: /^\/webhooks\/([a-z0-9-]+)$/,
    auth: "public",
    async handler({ request, env, ctx, url, match }) {
      const webhook = pluginFor(match[1])?.webhook;
      if (!webhook) return json({ error: "unknown source" }, 404);
      const rawBody = await request.text();
      if (!(await webhook.verify(request, rawBody, env).catch(() => false))) {
        return new Response("bad signature", { status: 401 });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return json({ error: "not json" }, 400);
      }
      // Sources with a bespoke webhook contract (handshakes, sub-3s acks)
      // take over the whole request; they emit events via core themselves.
      if (webhook.handle) {
        return webhook.handle(request, payload, env, ctx, coreFor(env, url.origin));
      }
      const events = (await webhook.parse?.(request.headers, payload, env)) ?? [];
      if (events.length > 0) {
        await appendEvents(env, events);
        ctx.waitUntil(
          Promise.all([...new Set(events.map((e) => e.ticketId))].map((t) => wakeTicket(env, t))),
        );
      }
      return json({ ok: true, events: events.length });
    },
  },
];
