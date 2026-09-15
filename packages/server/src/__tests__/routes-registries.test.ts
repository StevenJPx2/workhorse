// Registry routes: agent blocks, workflow defs, and editor metadata.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route, ServerDeps } from "../router";

// The agents routes reach ../agents, which imports @cloudflare/sandbox for
// seeding and installation. Outside workerd that module cannot load.
vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({ writeFile: vi.fn(), exec: vi.fn() }) }));

const { registryRoutes } = await import("../routes/registries");

const deps = {
  core: () => ({}) as never,
  attachmentProviders: () => new Map(),
  assembleAllTools: () => [],
  assembleChatExtensions: () => [],
  assembleChatTools: () => [],
  pluginFor: () => undefined,
  intake: {} as never,
} satisfies ServerDeps;

async function call(method: string, path: string, init: RequestInit = {}, env = fakeEnv()) {
  const url = new URL(`https://w.dev${path}`);
  const route = registryRoutes.find((r: Route) => {
    if (r.method !== method && r.method !== "*") return false;
    return typeof r.path === "string" ? r.path === url.pathname : r.path.test(url.pathname);
  });
  if (!route) throw new Error(`no route for ${method} ${path}`);

  const match = typeof route.path === "string" ? ([""] as never) : (url.pathname.match(route.path) as never);
  const res = await route.handler({
    request: new Request(url, { method, ...init }),
    env: env as never,
    ctx: { waitUntil: vi.fn() } as never,
    url,
    match,
    ...deps,
  });

  return { status: res.status, body: await res.json().catch(() => null), env };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /agents", () => {
  it("lists agent blocks", async () => {
    expect((await call("GET", "/agents")).body).toMatchObject({ agents: [] });
  });
});

describe("/agents/:name", () => {
  const block = {
    description: "implements one todo",
    tools: ["read", "write"],
    persona: "You implement exactly one todo.",
  };

  it("404s an unknown block", async () => {
    expect((await call("GET", "/agents/nope")).status).toBe(404);
  });

  it("stores and reads back a block", async () => {
    const env = fakeEnv();
    const put = await call("PUT", "/agents/coder", { body: JSON.stringify(block) }, env);
    expect(put.body).toMatchObject({ ok: true });

    const got = await call("GET", "/agents/coder", {}, env);
    expect(got.body).toMatchObject({ agent: { name: "coder", tools: ["read", "write"] } });
  });

  it("marks a block written through the API as user-owned", async () => {
    const env = fakeEnv();
    await call("PUT", "/agents/coder", { body: JSON.stringify(block) }, env);

    // Source matters for reseeding: a user's edit must not be clobbered by a seed.
    const got = await call("GET", "/agents/coder", {}, env);
    expect(got.body).toMatchObject({ agent: { source: "user" } });
  });

  it("422s a block with no persona", async () => {
    const r = await call("PUT", "/agents/coder", { body: JSON.stringify({ description: "x" }) });

    expect(r.status).toBe(422);
  });

  it("400s a PUT with no JSON body", async () => {
    expect((await call("PUT", "/agents/coder", { body: "not json" })).status).toBe(400);
  });

  it("deletes a block", async () => {
    const env = fakeEnv();
    await call("PUT", "/agents/coder", { body: JSON.stringify(block) }, env);
    await call("DELETE", "/agents/coder", {}, env);

    expect((await call("GET", "/agents/coder", {}, env)).status).toBe(404);
  });

  it("405s an unsupported method", async () => {
    expect((await call("POST", "/agents/coder")).status).toBe(405);
  });
});

describe("GET /workflows", () => {
  it("lists the hard-coded workflow defs", async () => {
    const r = await call("GET", "/workflows");

    // Workflows are code, not registry data — this is read-only by design.
    expect(r.body).toHaveProperty("workflows");
  });

  it("404s an unknown workflow", async () => {
    expect((await call("GET", "/workflows/nope")).status).toBe(404);
  });
});
