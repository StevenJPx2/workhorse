// Worker entry — thin by design: auth tiers + a route table. Domain logic
// lives in routes/* (file-per-domain, Nitro-style separation without a
// framework layer — this entry must also export the WorkflowEntrypoint
// and Sandbox DO classes, which wrangler wires directly).

import type { Env } from "@workhorse/api";
import { listTickets } from "./db";
import { healTicket } from "./heal";
import { coreFor, routeFor } from "./plugins";
import { dispatch, type Route } from "./router";
import { miscRoutes } from "./routes/misc";
import { registryRoutes } from "./routes/registries";
import { sandboxCallbackRoutes } from "./routes/sandbox-callbacks";
import { spikeRoutes } from "./routes/spike";
import { ticketRoutes } from "./routes/tickets";
import { triggerRoutes } from "./routes/triggers";
import { webhookRoutes } from "./routes/webhooks";

export { Sandbox } from "@cloudflare/sandbox";
export { TicketWorkflow } from "./ticket-workflow";
export { healTicket } from "./heal";

/** Table order = precedence. */
const routes: Route[] = [
  ...webhookRoutes, // public (per-plugin signatures)
  ...sandboxCallbackRoutes, // scoped (find, depcache)
  ...registryRoutes, // master (admin, agents, workflows, token, meta)
  ...ticketRoutes, // master (the fleet surface)
  ...triggerRoutes, // master registry + public secret-gated /fire
  ...miscRoutes, // master (chat, attachments/match, debug)
  ...spikeRoutes, // master (TEMPORARY flue-migration probe — delete post-cutover)
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const auth = request.headers.get("authorization") ?? "";
    const master = auth === `Bearer ${env.SPIKE_TOKEN}`;
    // Scoped tier: the token injected into ticket sandboxes (untrusted repo
    // code runs there — it must never hold the fleet master key).
    const scoped = master || (!!env.BROWSER_TOKEN && auth === `Bearer ${env.BROWSER_TOKEN}`);

    const hit = dispatch(routes, { request, env, ctx, url }, { scoped, master });
    if (hit) return hit;

    // Plugin-contributed routes (declared auth tier per route).
    const pluginRoute = routeFor(request.method, url.pathname);
    if (pluginRoute) {
      const ok = pluginRoute.auth === "scoped" ? scoped : master;
      if (!ok) return new Response("unauthorized", { status: 401 });
      return pluginRoute.handler(request, env, ctx, coreFor(env, url.origin));
    }

    if (!master) return new Response("unauthorized", { status: 401 });
    return new Response(
      "workhorse: POST /tickets {title,repo,prompt} | GET /tickets | GET /tickets/:id | GET /workflows | GET /agents",
    );
  },

  // Self-healing sweep: every 15 min, re-dispatch errored tickets that
  // still have heal budget. Skips anything a human already terminated.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const sweep = async () => {
      // Heals: one query instead of a full KV scan; 5-min quiet window
      // (avoids racing a deploy or a human investigating).
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const errored = await listTickets(env, "errored");
      for (const rec of errored) {
        if (rec.updatedAt >= cutoff) continue;
        const res = await healTicket(env, rec.id);
        console.log(`heal sweep ${rec.id}: ${res.ok ? `re-dispatched as ${res.instance}` : res.reason}`);
      }
      // Cron triggers: fire schedules that matched this window.
      const { sweepCronTriggers } = await import("./triggers");
      const fired = await sweepCronTriggers(env);
      if (fired.length) console.log(`cron triggers fired: ${fired.join(", ")}`);
    };
    ctx.waitUntil(sweep());
  },
};
