// createServer — the fetch handler's auth gate and plugin-route fallthrough.
//
// The tier resolution here is the fleet's front door: `scoped` is the token
// injected into ticket sandboxes, where untrusted repo code runs, so a scoped
// request reaching a master route would hand that code the fleet.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerDeps } from "../router";

vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({ exec: vi.fn(), writeFile: vi.fn() }) }));
vi.mock("../chat", () => ({ runFleetChat: vi.fn(async () => ({ ok: true, reply: "hi" })) }));

const { createServer } = await import("../index");

let pluginRoute: { auth: string; handler: ReturnType<typeof vi.fn> } | undefined;

const deps = {
  core: () => ({}) as never,
  attachmentProviders: () => new Map(),
  assembleChatTools: () => [],
  pluginFor: () => undefined,
  intake: {} as never,
  routeFor: () => pluginRoute as never,
} satisfies ServerDeps & { routeFor: unknown };

const env = fakeEnv({ SPIKE_TOKEN: "master-token", BROWSER_TOKEN: "scoped-token" });

const fetchWith = (path: string, token?: string, method = "GET") =>
  createServer(deps)(
    new Request(`https://w.dev${path}`, {
      method,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    }),
    env as never,
    { waitUntil: vi.fn() } as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  pluginRoute = undefined;
});

describe("the auth gate", () => {
  it("401s an unauthenticated request", async () => {
    expect((await fetchWith("/")).status).toBe(401);
  });

  it("serves usage to the master tier", async () => {
    const res = await fetchWith("/", "master-token");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("POST /tickets");
  });

  it("401s a SCOPED token on the master surface", async () => {
    // The scoped token lives in every ticket sandbox, where arbitrary repo code
    // runs. It may read callbacks; it may not command the fleet.
    expect((await fetchWith("/", "scoped-token")).status).toBe(401);
  });

  it("401s a wrong token", async () => {
    expect((await fetchWith("/", "guessed")).status).toBe(401);
  });

  it("401s a master route reached with the scoped token", async () => {
    expect((await fetchWith("/tickets", "scoped-token")).status).toBe(401);
  });
});

describe("plugin routes", () => {
  it("dispatches to a matching plugin route", async () => {
    const handler = vi.fn(async () => new Response("from the plugin"));
    pluginRoute = { auth: "master", handler };

    const res = await fetchWith("/gh/whatever", "master-token");

    expect(await res.text()).toBe("from the plugin");
  });

  it("enforces the plugin route's OWN auth tier", async () => {
    const handler = vi.fn(async () => new Response("secret"));
    pluginRoute = { auth: "master", handler };

    // A plugin declaring master must not be reachable with the sandbox token.
    expect((await fetchWith("/gh/whatever", "scoped-token")).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows a public plugin route with no credential", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    pluginRoute = { auth: "public", handler };

    expect((await fetchWith("/gh/callback", undefined, "POST")).status).toBe(200);
  });

  it("hands the plugin a Core", async () => {
    const handler = vi.fn(async (_req: unknown, _env: unknown, _ctx: unknown, _core: unknown) => new Response("ok"));
    pluginRoute = { auth: "public", handler };

    await fetchWith("/gh/callback", undefined, "POST");
    expect(handler.mock.calls[0][3]).toBeDefined();
  });

  it("falls through to usage when no plugin route matches", async () => {
    const res = await fetchWith("/nothing-here", "master-token");

    expect(await res.text()).toContain("POST /tickets");
  });
});
