// Fetch stubbing — for tools that call global fetch directly.
//
// A few tools (paste, imgup, github) walk real HTTP host chains and VERIFY the
// result before accepting it. Testing those means controlling fetch per-URL,
// not globally. `stubFetch` installs a route table on globalThis.fetch and
// returns a handle that records requests and restores the original.
//
// Deliberately does NOT depend on vitest — no vi.stubGlobal — so this stays
// usable from any runner.

export interface RecordedRequest {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

/** A route answer: a body string, a full Response, or a function of the request. */
export type RouteResponder =
  | string
  | Response
  | { status?: number; body?: string; headers?: Record<string, string> }
  | ((req: RecordedRequest) => string | Response | { status?: number; body?: string; headers?: Record<string, string> });

export interface StubFetchHandle {
  /** Every request made while the stub is installed, in order. */
  readonly requests: RecordedRequest[];
  /** URLs requested, in order — the common assertion (host chain ordering). */
  urls(): string[];
  /** Did any request go to a URL containing this fragment? */
  requested(fragment: string): boolean;
  /** Restore the original global fetch. */
  restore(): void;
}

function toResponse(r: string | Response | { status?: number; body?: string; headers?: Record<string, string> }): Response {
  if (r instanceof Response) return r;
  if (typeof r === "string") return new Response(r, { status: 200 });
  return new Response(r.body ?? "", { status: r.status ?? 200, headers: r.headers });
}

/**
 * Install a routing fetch stub.
 *
 * Routes are matched as URL SUBSTRINGS, longest key first, so a specific host
 * beats a general one. An unmatched URL throws by default — an accidental live
 * network call is a test bug worth surfacing loudly. Pass `fallback` to allow
 * a catch-all.
 */
export function stubFetch(
  routes: Record<string, RouteResponder>,
  opts: { fallback?: RouteResponder } = {},
): StubFetchHandle {
  const original = globalThis.fetch;
  const requests: RecordedRequest[] = [];
  const patterns = Object.entries(routes).sort((a, b) => b[0].length - a[0].length);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => {
      headers[k] = v;
    });

    const body = typeof init?.body === "string" ? init.body : undefined;
    const req: RecordedRequest = { url, method, body, headers };
    requests.push(req);

    for (const [fragment, responder] of patterns) {
      if (!url.includes(fragment)) continue;
      return toResponse(typeof responder === "function" ? responder(req) : responder);
    }

    if (opts.fallback !== undefined) {
      return toResponse(typeof opts.fallback === "function" ? opts.fallback(req) : opts.fallback);
    }

    throw new Error(`stubFetch: unrouted request to ${url} — add a route or pass { fallback }`);
  }) as typeof fetch;

  return {
    requests,
    urls: () => requests.map((r) => r.url),
    requested: (fragment) => requests.some((r) => r.url.includes(fragment)),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
