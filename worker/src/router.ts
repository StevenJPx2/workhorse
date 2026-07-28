// Minimal route table — Nitro's file-per-domain separation without a
// framework layer (the worker must also export WorkflowEntrypoint + the
// Sandbox DO, which wrangler-native entries handle directly).
//
// Auth tiers:
//   public — the route authenticates itself (webhook signatures)
//   scoped — sandbox callback token (untrusted repo code holds it) or master
//   master — the fleet bearer (SPIKE_TOKEN)

import type { Env } from "@workhorse/api";
import { type Auth, permits, type Tiers } from "@workhorse/auth";

export type { Auth };

export interface RouteCtx {
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

/** First matching route wins (table order is the precedence). */
export function dispatch(
  routes: Route[],
  c: Omit<RouteCtx, "match">,
  tiers: Tiers,
): Promise<Response> | Response | null {
  for (const r of routes) {
    if (r.method !== "*" && r.method !== c.request.method) continue;

    let match: RegExpMatchArray | null = null;
    if (typeof r.path === "string") {
      if (r.path !== c.url.pathname) continue;
      match = EMPTY_MATCH;
    } else {
      match = c.url.pathname.match(r.path);
      if (!match) continue;
    }

    // A matched-but-unauthorized route returns 401 rather than falling through:
    // continuing would let a later, looser route serve the request.
    if (!permits(r.auth, tiers)) return new Response("unauthorized", { status: 401 });

    return r.handler({ ...c, match });
  }
  return null;
}
