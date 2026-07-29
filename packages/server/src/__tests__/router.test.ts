// Route matching and auth-tier enforcement.
//
// The worker had no tests at all, which is why fallow scored these functions at
// 0% coverage. That is not a scoring artifact: dispatch decides whether a request
// reaches a master-only route, and nothing was verifying it.

import { describe, expect, it, vi } from "vitest";
import { dispatch, json, type Route, type RouteCtx, type ServerDeps } from "../router";

const NONE = { scoped: false, master: false };
const SCOPED = { scoped: true, master: false };
const MASTER = { scoped: true, master: true };

/** A route whose handler records that it ran and echoes its captures. */
function route(over: Partial<Route> = {}): Route & { calls: RegExpMatchArray[] } {
  const calls: RegExpMatchArray[] = [];
  const r = {
    method: "GET" as const,
    path: "/thing",
    auth: "master" as const,
    handler: ({ match }: { match: RegExpMatchArray }) => {
      calls.push(match);
      return json({ ok: true });
    },
    ...over,
    calls,
  };
  return r as Route & { calls: RegExpMatchArray[] };
}

/**
 * The composition-root surface a route receives.
 *
 * Every entry throws: dispatch and auth gating must not touch any of them, so a
 * call here means routing reached into a dependency it had no business using.
 */
const deps: ServerDeps = {
  core: () => {
    throw new Error("dispatch must not build a Core");
  },
  attachmentProviders: () => {
    throw new Error("dispatch must not read attachment providers");
  },
  assembleChatTools: () => {
    throw new Error("dispatch must not assemble chat tools");
  },
  pluginFor: () => {
    throw new Error("dispatch must not look up plugins");
  },
  intake: null as never,
};

function ctx(method: string, path: string): Omit<RouteCtx, "match"> {
  return {
    request: new Request(`https://w.dev${path}`, { method }),
    env: {} as never,
    ctx: {} as never,
    url: new URL(`https://w.dev${path}`),
    ...deps,
  };
}

describe("matching", () => {
  it("dispatches an exact string path", async () => {
    const r = route();
    const res = await dispatch([r], ctx("GET", "/thing"), MASTER);

    expect(res).toBeInstanceOf(Response);
    expect(r.calls).toHaveLength(1);
  });

  it("returns null when nothing matches, so the caller can fall through", async () => {
    // null (not 404) is what lets plugin routes be tried next.
    expect(dispatch([route()], ctx("GET", "/other"), MASTER)).toBeNull();
  });

  it("requires an exact string path, not a prefix", async () => {
    expect(dispatch([route({ path: "/thing" })], ctx("GET", "/thing/extra"), MASTER)).toBeNull();
  });

  it("does not match a different method", async () => {
    expect(dispatch([route({ method: "GET" })], ctx("POST", "/thing"), MASTER)).toBeNull();
  });

  it('matches any method with "*"', async () => {
    const r = route({ method: "*" });
    expect(dispatch([r], ctx("DELETE", "/thing"), MASTER)).not.toBeNull();
  });

  it("passes regex captures to the handler", async () => {
    const r = route({ path: /^\/tickets\/([a-z0-9-]+)\/steer$/ });
    await dispatch([r], ctx("GET", "/tickets/abc123/steer"), MASTER);

    expect(r.calls[0][1]).toBe("abc123");
  });

  it("gives a string-path handler a stand-in match array", async () => {
    const r = route();
    await dispatch([r], ctx("GET", "/thing"), MASTER);

    // Handlers take a uniform shape; an exact route has no captures but must
    // still receive something indexable.
    expect(r.calls[0][0]).toBe("");
  });

  it("takes the FIRST matching route (table order is precedence)", async () => {
    const first = route({ path: /^\/t\/(.+)$/ });
    const second = route({ path: /^\/t\/(.+)$/ });

    await dispatch([first, second], ctx("GET", "/t/x"), MASTER);
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(0);
  });
});

describe("auth enforcement", () => {
  it("lets an unauthenticated request into a public route", async () => {
    const r = route({ auth: "public" });
    await dispatch([r], ctx("GET", "/thing"), NONE);

    expect(r.calls).toHaveLength(1);
  });

  it("401s a master route for a scoped token", async () => {
    const r = route({ auth: "master" });
    const res = (await dispatch([r], ctx("GET", "/thing"), SCOPED)) as Response;

    // The core guarantee: a leaked sandbox token cannot command the fleet.
    expect(res.status).toBe(401);
    expect(r.calls).toHaveLength(0);
  });

  it("401s a scoped route for an unauthenticated request", async () => {
    const r = route({ auth: "scoped" });
    const res = (await dispatch([r], ctx("GET", "/thing"), NONE)) as Response;

    expect(res.status).toBe(401);
    expect(r.calls).toHaveLength(0);
  });

  it("admits master to a scoped route", async () => {
    const r = route({ auth: "scoped" });
    await dispatch([r], ctx("GET", "/thing"), MASTER);

    expect(r.calls).toHaveLength(1);
  });

  it("401s a matched-but-unauthorized route instead of falling through", async () => {
    const locked = route({ auth: "master", path: /^\/x\/(.+)$/ });
    const open = route({ auth: "public", path: /^\/x\/(.+)$/ });

    const res = (await dispatch([locked, open], ctx("GET", "/x/y"), NONE)) as Response;

    // Falling through would let the looser later route serve a request the
    // earlier one rejected — a privilege-escalation shape.
    expect(res.status).toBe(401);
    expect(open.calls).toHaveLength(0);
  });

  it("checks auth only for the route that matched", async () => {
    const unrelated = route({ auth: "master", path: "/admin" });
    const wanted = route({ auth: "public", path: "/health" });

    await dispatch([unrelated, wanted], ctx("GET", "/health"), NONE);
    expect(wanted.calls).toHaveLength(1);
  });
});

describe("json", () => {
  it("defaults to 200 with a JSON content type", async () => {
    const res = json({ a: 1 });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("honours an explicit status", () => {
    expect(json({ error: "nope" }, 409).status).toBe(409);
  });
});

describe("handler errors", () => {
  it("propagates a throwing handler rather than swallowing it", async () => {
    const boom = route({ handler: () => { throw new Error("handler blew up"); } });

    // Swallowing would turn a bug into a silent 200; the caller decides.
    expect(() => dispatch([boom], ctx("GET", "/thing"), MASTER)).toThrow("handler blew up");
  });

  it("returns the handler's promise unawaited for async handlers", async () => {
    const r = route({ handler: async () => json({ async: true }) });
    const res = dispatch([r], ctx("GET", "/thing"), MASTER);

    expect(res).toBeInstanceOf(Promise);
    expect(await (await res as Response).json()).toEqual({ async: true });
  });
});

describe("dispatch is side-effect free on no match", () => {
  it("does not consume the request body", async () => {
    const c = {
      ...ctx("POST", "/nothing"),
      request: new Request("https://w.dev/nothing", { method: "POST", body: "payload" }),
    };
    const spy = vi.spyOn(c.request, "text");

    dispatch([route()], c, MASTER);

    // A route table that read the body while probing would break every later
    // handler that needs it.
    expect(spy).not.toHaveBeenCalled();
    expect(await c.request.text()).toBe("payload");
  });
});
