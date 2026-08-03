// Minimal route table — Nitro's file-per-domain separation without a
// framework layer (the worker must also export WorkflowEntrypoint + the
// Sandbox DO, which wrangler-native entries handle directly).
//
// Auth tiers:
//   public — the route authenticates itself (webhook signatures)
//   scoped — sandbox callback token (untrusted repo code holds it) or master
//   master — the fleet bearer (SPIKE_TOKEN)

import type { AttachmentProvider, Core, Env, WorkhorseTool } from "@workhorse/api";
import { type Auth, permits, type Tiers } from "@workhorse/auth";

export type { Auth };

/**
 * What the composition root supplies to every route.
 *
 * Routes used to call `coreFor(env, url.origin)` and import the plugin registry
 * directly, which is what tied this layer to every plugin. Injected here instead:
 * the worker binds them once, and a route test supplies fakes.
 */
export interface ServerDeps {
  /** The Core facade for this request's origin. */
  core: (env: Env, selfOrigin: string) => Core;
  /** Plugin attachment providers, keyed by kind. */
  attachmentProviders: () => Map<string, AttachmentProvider>;
  /** Chat-surface tools across plugins. */
  assembleChatTools: (ctx: import("@workhorse/api").ToolContext) => WorkhorseTool[];
  /** One plugin by id — webhook routes dispatch to its verifier. */
  pluginFor: (id: string) => import("@workhorse/api").WorkhorsePlugin | undefined;
  /** The intake surface, bound to the same providers. */
  intake: import("@workhorse/intake").Intake;
  /** Optional workflow catalog supplied by the deployment composition root. */
  workflows?: WorkflowCatalog;
}

export interface WorkflowCatalogEntry {
  name: string;
  description?: string;
  stageCount: number;
  stages: string[];
  spec: unknown;
}

export interface WorkflowCatalog {
  list(): Promise<WorkflowCatalogEntry[]> | WorkflowCatalogEntry[];
  get(name: string): Promise<WorkflowCatalogEntry | undefined> | WorkflowCatalogEntry | undefined;
}

export interface RouteCtx extends ServerDeps {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  /** Regex captures when the route pattern is a RegExp. */
  match: RegExpMatchArray;
}

export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE" | "*";
  /** Exact pathname or a ^…$ regex with captures. */
  path: string | RegExp;
  auth: Auth;
  handler(c: RouteCtx): Promise<Response> | Response;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

const EMPTY_MATCH = [""] as unknown as RegExpMatchArray;

/** The route's captures if it matches this request, else null. */
function routeMatch(r: Route, method: string, pathname: string): RegExpMatchArray | null {
  if (r.method !== "*" && r.method !== method) return null;

  // A string path has no captures, but handlers take a uniform shape, so exact
  // matches get a stand-in match array rather than a special case downstream.
  if (typeof r.path === "string") return r.path === pathname ? EMPTY_MATCH : null;

  return pathname.match(r.path);
}

/** First matching route wins (table order is the precedence). */
export function dispatch(
  routes: Route[],
  c: Omit<RouteCtx, "match">,
  tiers: Tiers,
): Promise<Response> | Response | null {
  for (const r of routes) {
    const match = routeMatch(r, c.request.method, c.url.pathname);
    if (!match) continue;

    // A matched-but-unauthorized route returns 401 rather than falling through:
    // continuing would let a later, looser route serve the request.
    if (!permits(r.auth, tiers)) return new Response("unauthorized", { status: 401 });

    return r.handler({ ...c, match });
  }
  return null;
}
