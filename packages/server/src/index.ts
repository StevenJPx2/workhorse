// @workhorse/server — the HTTP surface.
//
// Everything request-shaped: the route table, the auth tiers that gate it, the
// fleet-chat runner, agent blocks, triggers, and the tool catalog.
//
// It imports NO plugins. The three things routes used to reach the registry for —
// the Core facade, attachment providers, chat tools — arrive as `ServerDeps`, so
// the composition root stays the only place that knows which plugins exist.

import type { Env } from "@workhorse/api";
import { permits, resolveTiers } from "@workhorse/auth";
import { dispatch, type Route, type ServerDeps } from "./router";
import { miscRoutes } from "./routes/misc";
import { registryRoutes } from "./routes/registries";
import { sandboxCallbackRoutes } from "./routes/sandbox-callbacks";
import { ticketRoutes } from "./routes/tickets";
import { triggerRoutes } from "./routes/triggers";
import { webhookRoutes } from "./routes/webhooks";

export { json } from "./router";
export type { Auth, Route, RouteCtx, ServerDeps } from "./router";

export {
  deleteAgentBlock,
  getAgentBlock,
  installAgentBlocks,
  listAgentBlocks,
  putAgentBlock,
  seedAgentBlocks,
} from "./agents";
export type { AgentBlock } from "./agents";

export { runFleetChat } from "./chat";
export { scriptIndex, toolIndex, workflowIndex } from "./semindex";
export { toolContext } from "./tool-context";
export { cronMatches, fireTrigger, listTriggers, renderTemplate, sweepCronTriggers, validateCron } from "./triggers";

/** Table order is precedence — the first match wins. */
const routes: Route[] = [
  ...webhookRoutes, // public (per-plugin signatures)
  ...sandboxCallbackRoutes, // scoped (find, depcache)
  ...registryRoutes, // master (admin, agents, workflows, token, meta)
  ...ticketRoutes, // master (the fleet surface)
  ...triggerRoutes, // master registry + public secret-gated /fire
  ...miscRoutes, // master (chat, attachments/match, debug)
];

/** What a plugin route needs beyond ServerDeps. */
export interface PluginRouting {
  /** Find a plugin-contributed route, or undefined. */
  routeFor: (method: string, pathname: string) => import("@workhorse/api").PluginRoute | undefined;
}

const USAGE =
  "workhorse: POST /tickets {title,repo,prompt} | GET /tickets | GET /tickets/:id | GET /workflows | GET /agents";

/**
 * Build the fetch handler.
 *
 * Plugin routes are resolved through the injected `routeFor` rather than a static
 * import, which is what keeps this package free of plugin dependencies.
 */
export function createServer(deps: ServerDeps & PluginRouting) {
  return async function fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Scoped tier: the token injected into ticket sandboxes (untrusted repo code
    // runs there — it must never hold the fleet master key). Comparison is
    // constant-time; see @workhorse/auth.
    const tiers = resolveTiers(request.headers.get("authorization"), {
      master: env.SPIKE_TOKEN,
      scoped: env.BROWSER_TOKEN,
    });

    const hit = dispatch(routes, { request, env, ctx, url, ...deps }, tiers);
    if (hit) return hit;

    // Plugin-contributed routes declare their own auth tier.
    const pluginRoute = deps.routeFor(request.method, url.pathname);
    if (pluginRoute) {
      if (!permits(pluginRoute.auth, tiers)) return new Response("unauthorized", { status: 401 });
      return pluginRoute.handler(request, env, ctx, deps.core(env, url.origin));
    }

    if (!tiers.master) return new Response("unauthorized", { status: 401 });
    return new Response(USAGE);
  };
}
