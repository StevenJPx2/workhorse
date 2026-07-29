// The remaining route modules: triggers, webhooks, sandbox callbacks, registries.
//
// All were untestable before the extraction (they reached the plugin registry
// through coreFor) and all scored 0% coverage. The two that matter most are the
// webhook route — which decides whether an UNAUTHENTICATED request is accepted —
// and the sandbox callbacks, which untrusted repo code can reach.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route, ServerDeps } from "../router";

const ticketsGet = vi.fn<() => Promise<unknown>>(async () => null);

vi.mock("@workhorse/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workhorse/db")>()),
  db: () => ({ tickets: { get: ticketsGet }, scripts: { list: async () => [] } }),
}));

const appendEvents = vi.fn();
const wakeTicket = vi.fn();

vi.mock("@workhorse/events", () => ({ appendEvents, wakeTicket, appendSteer: vi.fn() }));

const runFleetChat = vi.fn(
  async (_env: unknown, _core: unknown, _origin: string, _messages: unknown, _tools: unknown) => ({
    ok: true,
    reply: "hello from the fleet",
  }),
);

vi.mock("../chat", () => ({ runFleetChat }));
const sandboxExec = vi.fn(async (_cmd: string, _opts?: { timeout?: number }) => ({
  exitCode: 0,
  stdout: "node=v22.0.0",
  stderr: "",
}));

vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({ exec: sandboxExec, writeFile: vi.fn() }) }));

const { miscRoutes } = await import("../routes/misc");
const { triggerRoutes } = await import("../routes/triggers");
const { webhookRoutes } = await import("../routes/webhooks");
const { sandboxCallbackRoutes } = await import("../routes/sandbox-callbacks");

/** A plugin whose webhook verifier can be scripted per test. */
function plugin(over: Record<string, unknown> = {}) {
  return {
    id: "github",
    webhook: {
      verify: vi.fn(async () => true),
      parse: vi.fn(async () => [{ ticketId: "t1", kind: "pr-merged", summary: "merged" }]),
      ...over,
    },
  };
}

let currentPlugin: ReturnType<typeof plugin> | undefined;

const deps = {
  core: () => ({}) as never,
  attachmentProviders: () => new Map(),
  assembleChatTools: () => [],
  pluginFor: () => currentPlugin as never,
  intake: { fileTicket: vi.fn(async () => ({ ok: true, ticket: { id: "t1" } })) } as never,
} satisfies ServerDeps;

async function call(routes: Route[], method: string, path: string, init: RequestInit = {}, env = fakeEnv()) {
  const url = new URL(`https://w.dev${path}`);
  const route = routes.find((r) => {
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

  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentPlugin = plugin();
  ticketsGet.mockResolvedValue(null);
});

describe("POST /chat", () => {
  it("returns the fleet agent reply", async () => {
    const r = await call(miscRoutes, "POST", "/chat", {
      body: JSON.stringify({ messages: [{ role: "user", content: "how many tickets?" }] }),
    });

    expect(r.body).toMatchObject({ reply: "hello from the fleet" });
  });

  it("passes the request origin so tool callbacks resolve", async () => {
    await call(miscRoutes, "POST", "/chat", { body: JSON.stringify({ messages: [] }) });

    expect(runFleetChat.mock.calls[0][2]).toBe("https://w.dev");
  });

  it("surfaces the runner error and status", async () => {
    runFleetChat.mockResolvedValue({ ok: false, error: "no fresh token", status: 503 } as never);
    const r = await call(miscRoutes, "POST", "/chat", { body: JSON.stringify({ messages: [] }) });

    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ error: "no fresh token" });
  });
});

describe("POST /attachments/match", () => {
  it("returns no match for empty input", async () => {
    expect((await call(miscRoutes, "POST", "/attachments/match", { body: JSON.stringify({ input: "  " }) })).body)
      .toMatchObject({ match: null });
  });
});

describe("debug routes", () => {
  it("reports the sandbox toolchain", async () => {
    const r = await call(miscRoutes, "GET", "/env");

    expect(r.body).toMatchObject({ exitCode: 0, stdout: "node=v22.0.0" });
  });

  it("runs an arbitrary command in the default sandbox", async () => {
    const r = await call(miscRoutes, "POST", "/exec", { body: JSON.stringify({ cmd: "ls -la" }) });

    expect(sandboxExec).toHaveBeenCalledWith("ls -la", { timeout: 300_000 });
    expect(r.body).toMatchObject({ exitCode: 0 });
  });

  it("targets a named sandbox when one is given", async () => {
    await call(miscRoutes, "POST", "/exec", { body: JSON.stringify({ cmd: "pwd", sandbox: "ticket-t1" }) });

    // Debugging a specific ticket means reaching ITS container, not phase0.
    expect(sandboxExec).toHaveBeenCalledWith("pwd", { timeout: 300_000 });
  });

  it("returns a non-zero exit rather than erroring", async () => {
    sandboxExec.mockResolvedValue({ exitCode: 127, stdout: "", stderr: "not found" });
    const r = await call(miscRoutes, "POST", "/exec", { body: JSON.stringify({ cmd: "nope" }) });

    // A failed command is information, not a server error.
    expect(r.body).toMatchObject({ exitCode: 127, stderr: "not found" });
  });
});

describe("POST /webhooks/:source", () => {
  it("accepts a verified delivery and queues its events", async () => {
    const r = await call(webhookRoutes, "POST", "/webhooks/github", { body: "{}" });

    expect(r.status).toBe(200);
    expect(appendEvents).toHaveBeenCalledTimes(1);
  });

  it("REJECTS a delivery whose signature does not verify", async () => {
    currentPlugin = plugin({ verify: vi.fn(async () => false) });
    const r = await call(webhookRoutes, "POST", "/webhooks/github", { body: "{}" });

    // This route is `auth: "public"` — the signature IS the authentication, so a
    // failure here is the difference between a webhook and an open endpoint.
    expect(r.status).toBe(401);
    expect(appendEvents).not.toHaveBeenCalled();
  });

  it("404s an unknown source", async () => {
    currentPlugin = undefined;

    expect((await call(webhookRoutes, "POST", "/webhooks/nope", { body: "{}" })).status).toBe(404);
  });

  it("404s a plugin that has no webhook", async () => {
    currentPlugin = { id: "todo" } as never;

    expect((await call(webhookRoutes, "POST", "/webhooks/todo", { body: "{}" })).status).toBe(404);
  });

  it("accepts a delivery that parses to no events", async () => {
    currentPlugin = plugin({ parse: vi.fn(async () => []) });
    const r = await call(webhookRoutes, "POST", "/webhooks/github", { body: "{}" });

    // Most deliveries are irrelevant to us; a 200 stops the sender retrying.
    expect(r.status).toBe(200);
    expect(appendEvents).not.toHaveBeenCalled();
  });

  it("wakes the tickets its events belong to", async () => {
    await call(webhookRoutes, "POST", "/webhooks/github", { body: "{}" });

    expect(wakeTicket).toHaveBeenCalled();
  });
});

describe("trigger routes", () => {
  it("lists triggers", async () => {
    const r = await call(triggerRoutes, "GET", "/triggers");

    expect(r.body).toMatchObject({ triggers: [] });
  });

  it("404s an unknown trigger", async () => {
    expect((await call(triggerRoutes, "GET", "/triggers/nope")).status).toBe(404);
  });

  it("does not route a name outside [a-z0-9-]", async () => {
    // The pattern itself excludes it, so the request falls through to a 404
    // rather than reaching the handler's own 400.
    await expect(call(triggerRoutes, "GET", "/triggers/Bad-Name-UPPER")).rejects.toThrow("no route");
  });

  it("stores a valid trigger", async () => {
    const env = fakeEnv();
    const r = await call(
      triggerRoutes,
      "PUT",
      "/triggers/nightly",
      { body: JSON.stringify({ source: "cron", schedule: "0 3 * * *", template: "go", repo: "acme/x" }) },
      env,
    );

    expect(r.body).toMatchObject({ ok: true });
  });

  it("422s an invalid trigger rather than storing it", async () => {
    const r = await call(triggerRoutes, "PUT", "/triggers/nightly", {
      body: JSON.stringify({ source: "cron", template: "go", repo: "acme/x" }),
    });

    // Missing schedule on a cron trigger: storing it would create a registry
    // entry that silently never fires.
    expect(r.status).toBe(422);
  });

  it("400s a PUT with no JSON body", async () => {
    expect((await call(triggerRoutes, "PUT", "/triggers/nightly", { body: "not json" })).status).toBe(400);
  });

  it("deletes", async () => {
    expect((await call(triggerRoutes, "DELETE", "/triggers/nightly")).body).toMatchObject({ ok: true });
  });
});

describe("POST /triggers/:name/fire", () => {
  const env = () => fakeEnv({ SPIKE_TOKEN: "master-token", TRIGGER_SECRET: "shared-secret" });

  const fire = (path: string, init: RequestInit = {}) =>
    call(triggerRoutes, "POST", path, { body: "{}", ...init }, env());

  it("401s with no credential at all", async () => {
    expect((await fire("/triggers/nightly/fire")).status).toBe(401);
  });

  it("accepts the master bearer", async () => {
    const r = await fire("/triggers/nightly/fire", {
      body: "{}",
      headers: { authorization: "Bearer master-token" },
    });

    // 404 from fireTrigger (no such trigger) means auth PASSED.
    expect(r.status).not.toBe(401);
  });

  it("accepts the shared secret in the query string", async () => {
    // Webhook senders that cannot set headers still need a way in.
    expect((await fire("/triggers/nightly/fire?secret=shared-secret")).status).not.toBe(401);
  });

  it("401s a wrong secret", async () => {
    expect((await fire("/triggers/nightly/fire?secret=wrong-secret")).status).toBe(401);
  });

  it("401s a secret that is a PREFIX of the real one", async () => {
    // The comparison is constant-time; a === would short-circuit here and leak
    // how much of a guess was correct.
    expect((await fire("/triggers/nightly/fire?secret=shared")).status).toBe(401);
  });

  it("401s when no TRIGGER_SECRET is configured, even with an empty one supplied", async () => {
    const bare = fakeEnv({ SPIKE_TOKEN: "master-token" });
    const r = await call(triggerRoutes, "POST", "/triggers/n/fire?secret=", { body: "{}" }, bare);

    // Otherwise an unset secret would authenticate everyone.
    expect(r.status).toBe(401);
  });
});

describe("sandbox callbacks", () => {
  const HASH = "a".repeat(64);

  it("serves a dependency cache miss as 404", async () => {
    const env = fakeEnv({ BLOBS: { get: async () => null } });
    const r = await call(sandboxCallbackRoutes, "GET", `/depcache?repo=acme/x&hash=${HASH}`, {}, env);

    expect(r.status).toBe(404);
  });

  it("400s a malformed hash before touching R2", async () => {
    const get = vi.fn();
    const env = fakeEnv({ BLOBS: { get } });
    const r = await call(sandboxCallbackRoutes, "GET", "/depcache?repo=acme/x&hash=nope", {}, env);

    expect(r.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it("REJECTS a path-traversal repo", async () => {
    const get = vi.fn();
    const env = fakeEnv({ BLOBS: { get } });
    const r = await call(sandboxCallbackRoutes, "GET", `/depcache?repo=../../etc&hash=${HASH}`, {}, env);

    // This route is reachable by untrusted repo code holding the scoped token, so
    // the key it builds must not be able to escape the depcache prefix.
    expect(r.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it("400s /find with no query", async () => {
    expect((await call(sandboxCallbackRoutes, "GET", "/find?corpus=scripts")).status).toBe(400);
  });

  it("400s /find with an unknown corpus", async () => {
    expect((await call(sandboxCallbackRoutes, "GET", "/find?corpus=nope&q=x")).status).toBe(400);
  });

  it("400s a PUT with a malformed hash", async () => {
    const put = vi.fn();
    const env = fakeEnv({ BLOBS: { put } });
    const r = await call(sandboxCallbackRoutes, "PUT", "/depcache?repo=acme/x&hash=short", { body: "data" }, env);

    expect(r.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("saves a dependency cache entry", async () => {
    const put = vi.fn();
    const env = fakeEnv({ BLOBS: { put } });
    const r = await call(sandboxCallbackRoutes, "PUT", `/depcache?repo=acme/x&hash=${HASH}`, { body: "data" }, env);

    expect(r.status).toBe(200);
    expect(put.mock.calls[0][0]).toBe(`depcache/acme/x/${HASH}.tar.gz`);
  });

  it("405s an unsupported method on /depcache", async () => {
    const env = fakeEnv({ BLOBS: {} });
    const r = await call(sandboxCallbackRoutes, "DELETE", `/depcache?repo=acme/x&hash=${HASH}`, {}, env);

    expect(r.status).toBe(405);
  });
});
