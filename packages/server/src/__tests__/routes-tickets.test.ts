// The ticket routes — the fleet's primary surface.
//
// Untestable before the extraction: every handler called `coreFor(env, origin)`,
// which reached the plugin registry, so a route test meant loading all fourteen
// plugins. With ServerDeps injected they take fakes, which is the point of the
// boundary.
//
// Two behaviours here carry real weight: the detail route RECONCILES a dead
// instance against a stale record (so the UI cannot lie about a running ticket),
// and the state guards decide which operations a ticket accepts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Route, ServerDeps } from "../router";

const ticketsGet = vi.fn<() => Promise<unknown>>();
const ticketsList = vi.fn<() => Promise<unknown[]>>(async () => []);
const ticketsPatch = vi.fn();
const knownRepos = vi.fn<() => Promise<unknown[]>>(async () => []);
const notificationsList = vi.fn<() => Promise<unknown[]>>(async () => []);
const wfStatus = vi.fn<() => Promise<{ status?: string }>>();

vi.mock("@workhorse/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workhorse/db")>()),
  db: () => ({
    tickets: { get: ticketsGet, list: ticketsList, patch: ticketsPatch, knownRepos },
    notifications: { list: notificationsList },
  }),
}));

const appendSteer = vi.fn();
const appendEvents = vi.fn();
const wakeTicket = vi.fn();

vi.mock("@workhorse/events", () => ({ appendSteer, appendEvents, wakeTicket }));

const fileTicket = vi.fn(async (_env: unknown, _body: Record<string, unknown>) => ({
  ok: true,
  ticket: { id: "new1" },
}));
const resolveAttachments = vi.fn(async () => "## Attached context\n\nstuff");
const healTicket = vi.fn(async () => ({ ok: true, instance: "t1-h1" }));

vi.mock("@workhorse/intake", () => ({ healTicket }));

const driverExec = vi.fn(async () => ({ exitCode: 0, stdout: "/workspace/.workflow/def-t1/stages/implement/round-2", stderr: "" }));
const driverReadFile = vi.fn(async () => "the analysis");

vi.mock("@workhorse/sandbox", () => ({
  sandboxDriver: () => ({ exec: driverExec, readFile: driverReadFile }),
}));

const { ticketRoutes } = await import("../routes/tickets");

/** The injected composition-root surface, all fakes. */
const deps = {
  core: () => ({}) as never,
  attachmentProviders: () => new Map(),
  assembleChatTools: () => [],
  pluginFor: () => undefined,
  intake: { fileTicket, resolveAttachments } as never,
} satisfies ServerDeps;

const env = {
  TICKET_WF: { get: async () => ({ status: wfStatus }) },
  TICKETS: { get: async () => null, put: vi.fn() },
} as never;

/** Find a route by method + a path it should match, then run it. */
async function call(method: string, path: string, body?: unknown) {
  const url = new URL(`https://w.dev${path}`);
  const route = ticketRoutes.find((r: Route) => {
    if (r.method !== method) return false;
    return typeof r.path === "string" ? r.path === path : r.path.test(path);
  });
  if (!route) throw new Error(`no route for ${method} ${path}`);

  const match = typeof route.path === "string" ? ([""] as never) : (path.match(route.path) as never);
  const res = await route.handler({
    request: new Request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    env,
    ctx: { waitUntil: vi.fn() } as never,
    url,
    match,
    ...deps,
  });

  return { status: res.status, body: await res.json() };
}

/** call(), with an env supplied per test. */
async function callWith(method: string, path: string, body: unknown, customEnv: never) {
  const url = new URL(`https://w.dev${path}`);
  const route = ticketRoutes.find((r: Route) => {
    if (r.method !== method) return false;
    return typeof r.path === "string" ? r.path === url.pathname : r.path.test(url.pathname);
  });
  if (!route) throw new Error(`no route for ${method} ${path}`);

  const match = typeof route.path === "string" ? ([""] as never) : (url.pathname.match(route.path) as never);
  const res = await route.handler({
    request: new Request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
    env: customEnv,
    ctx: { waitUntil: vi.fn() } as never,
    url,
    match,
    ...deps,
  });

  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const ticket = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Fix login",
  repo: "acme/widgets",
  status: "implementing",
  wfInstance: "t1",
  updatedAt: "2026-07-29T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  wfStatus.mockResolvedValue({ status: "running" });
  ticketsList.mockResolvedValue([]);
  notificationsList.mockResolvedValue([]);
});

describe("POST /tickets", () => {
  it("files a ticket through intake", async () => {
    const r = await call("POST", "/tickets", { repo: "acme/widgets", prompt: "go" });

    expect(r.body).toMatchObject({ ok: true, ticket: { id: "new1" } });
    expect(fileTicket).toHaveBeenCalledTimes(1);
  });

  it("passes the request origin so callbacks resolve", async () => {
    await call("POST", "/tickets", { repo: "acme/widgets", prompt: "go" });

    expect(fileTicket.mock.calls[0][1]).toMatchObject({ selfOrigin: "https://w.dev" });
  });

  it("surfaces intake's own error and status", async () => {
    fileTicket.mockResolvedValue({ ok: false, error: "repo, prompt required", status: 400 } as never);
    const r = await call("POST", "/tickets", {});

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "repo, prompt required" });
  });
});

describe("GET /tickets/:id", () => {
  it("returns the record with live workflow status", async () => {
    ticketsGet.mockResolvedValue(ticket());
    const r = await call("GET", "/tickets/t1");

    expect(r.body).toMatchObject({ ticket: { id: "t1" }, workflow: { status: "running" } });
  });

  it("404s an unknown ticket", async () => {
    ticketsGet.mockResolvedValue(null);

    expect((await call("GET", "/tickets/nope")).status).toBe(404);
  });

  it("RECONCILES a record that claims active while the instance is dead", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "implementing" }));
    wfStatus.mockResolvedValue({ status: "errored" });
    // patch returns the updated record, and the route responds with THAT — not
    // the stale one it read.
    ticketsPatch.mockResolvedValue({ next: ticket({ status: "errored" }) });

    const r = await call("GET", "/tickets/t1");

    // Without this the UI shows a ticket as running forever after the instance
    // died — the exact failure the heal sweep exists to catch, surfaced sooner.
    expect(ticketsPatch).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "errored" }));
    expect(r.body).toMatchObject({ ticket: { status: "errored" } });
  });

  it("does NOT reconcile a ticket already in a terminal state", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "done" }));
    wfStatus.mockResolvedValue({ status: "complete" });

    await call("GET", "/tickets/t1");
    expect(ticketsPatch).not.toHaveBeenCalled();
  });

  it("does not reconcile while the instance is genuinely running", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "implementing" }));
    wfStatus.mockResolvedValue({ status: "running" });

    await call("GET", "/tickets/t1");
    expect(ticketsPatch).not.toHaveBeenCalled();
  });

  it("still returns the record when the instance cannot be reached", async () => {
    ticketsGet.mockResolvedValue(ticket());
    wfStatus.mockRejectedValue(new Error("no instance yet"));

    // A just-filed ticket has no instance; that must not 500 the detail page.
    expect((await call("GET", "/tickets/t1")).body).toMatchObject({ ticket: { id: "t1" } });
  });
});

describe("POST /tickets/:id/heal", () => {
  it("delegates to intake's healTicket", async () => {
    const r = await call("POST", "/tickets/t1/heal");

    expect(healTicket).toHaveBeenCalledWith(env, "t1");
    expect(r.body).toMatchObject({ ok: true });
  });

  it("reports a refusal", async () => {
    healTicket.mockResolvedValue({ ok: false, reason: "heal limit (3) reached" } as never);
    const r = await call("POST", "/tickets/t1/heal");

    expect(r.body).toMatchObject({ ok: false });
  });
});

describe("POST /tickets/:id/stop", () => {
  const terminate = vi.fn(async () => {});
  const stopEnv = () =>
    ({
      TICKET_WF: { get: async () => ({ terminate, status: wfStatus }) },
      TICKETS: { get: async () => null, put: vi.fn() },
    }) as never;

  beforeEach(() => {
    terminate.mockReset();
    terminate.mockResolvedValue(undefined);
  });

  it("terminates the instance and marks the ticket stopped", async () => {
    ticketsGet.mockResolvedValue(ticket());
    const r = await callWith("POST", "/tickets/t1/stop", undefined, stopEnv());

    expect(terminate).toHaveBeenCalled();
    expect(ticketsPatch).toHaveBeenCalledWith("t1", { status: "terminated", error: "stopped by user" });
    expect(r.body).toMatchObject({ ok: true });
  });

  it("404s an unknown ticket", async () => {
    ticketsGet.mockResolvedValue(null);

    expect((await callWith("POST", "/tickets/nope/stop", undefined, stopEnv())).status).toBe(404);
  });

  it("500s WITHOUT marking the ticket stopped when terminate fails", async () => {
    ticketsGet.mockResolvedValue(ticket());
    terminate.mockRejectedValue(new Error("instance gone"));

    // Recording a stop that did not happen would leave a live run untracked.
    const r = await callWith("POST", "/tickets/t1/stop", undefined, stopEnv());
    expect(r.status).toBe(500);
    expect(ticketsPatch).not.toHaveBeenCalled();
  });

  it("terminates the RECORDED instance, not the ticket id", async () => {
    ticketsGet.mockResolvedValue(ticket({ wfInstance: "t1-h2" }));
    const get = vi.fn(async () => ({ terminate, status: wfStatus }));

    await callWith("POST", "/tickets/t1/stop", undefined, {
      TICKET_WF: { get },
      TICKETS: { get: async () => null, put: vi.fn() },
    } as never);

    // After a heal the live instance is t1-hN; stopping t1 would kill a corpse
    // and leave the real run going.
    expect(get).toHaveBeenCalledWith("t1-h2");
  });
});

describe("POST /tickets/:id/steer", () => {
  it("queues a steer for a live ticket", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "implementing" }));
    const r = await call("POST", "/tickets/t1/steer", { message: "use the other library" });

    expect(appendSteer).toHaveBeenCalledWith(env, "t1", "use the other library");
    expect(r.body).toMatchObject({ ok: true });
  });

  it("refuses when the ticket is not live", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "done" }));
    const r = await call("POST", "/tickets/t1/steer", { message: "too late" });

    // Steering targets a running stage; a done ticket has none.
    expect(r.status).toBe(409);
    expect(appendSteer).not.toHaveBeenCalled();
  });

  it("requires a message", async () => {
    ticketsGet.mockResolvedValue(ticket());
    const r = await call("POST", "/tickets/t1/steer", { message: "   " });

    expect(r.status).toBe(400);
    expect(appendSteer).not.toHaveBeenCalled();
  });

  it("truncates a very long steer", async () => {
    ticketsGet.mockResolvedValue(ticket());
    await call("POST", "/tickets/t1/steer", { message: "x".repeat(9000) });

    expect((appendSteer.mock.calls[0][2] as string).length).toBe(4000);
  });

  it("404s an unknown ticket", async () => {
    ticketsGet.mockResolvedValue(null);

    expect((await call("POST", "/tickets/nope/steer", { message: "x" })).status).toBe(404);
  });
});

describe("POST /tickets/:id/attach", () => {
  it("steers the context in when the ticket is live", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "implementing" }));
    const r = await call("POST", "/tickets/t1/attach", { kind: "jira", ref: "PROJ-42" });

    expect(appendSteer).toHaveBeenCalled();
    expect(r.body).toMatchObject({ delivered: "steer" });
  });

  it("queues an EVENT when the ticket is parked", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "in-review" }));
    const r = await call("POST", "/tickets/t1/attach", { kind: "jira", ref: "PROJ-42" });

    // A parked ticket has no live stage to steer; the event wakes it instead.
    expect(appendEvents).toHaveBeenCalled();
    expect(r.body).toMatchObject({ delivered: "event" });
  });

  it("422s when the attachment does not resolve", async () => {
    ticketsGet.mockResolvedValue(ticket());
    resolveAttachments.mockResolvedValue("" as never);

    expect((await call("POST", "/tickets/t1/attach", { kind: "jira", ref: "X" })).status).toBe(422);
  });

  it("requires both kind and ref", async () => {
    ticketsGet.mockResolvedValue(ticket());

    expect((await call("POST", "/tickets/t1/attach", { kind: "jira" })).status).toBe(400);
  });
});

describe("GET /tickets/:id/activity", () => {
  const activityEnv = (stored: string | null) =>
    ({
      TICKETS: { get: async () => stored, put: vi.fn() },
      TICKET_WF: { get: async () => ({ status: wfStatus }) },
    }) as never;

  it("serves the persisted trail verbatim", async () => {
    const stored = JSON.stringify({ tasks: [{ id: "plan" }] });
    const r = await callWith("GET", "/tickets/t1/activity", undefined, activityEnv(stored));

    expect(r.body).toMatchObject({ tasks: [{ id: "plan" }] });
  });

  it("reports a run in progress when nothing is stored yet", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: "def-t1" }));
    const r = await callWith("GET", "/tickets/t1/activity", undefined, activityEnv(null));

    // The def path writes on every attempt, so an empty read means the first
    // stage simply has not finished.
    expect(r.body).toMatchObject({ runId: "def-t1", tasks: [], note: "run in progress" });
  });

  it("reports not started when there is no run", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: undefined }));
    const r = await callWith("GET", "/tickets/t1/activity", undefined, activityEnv(null));

    expect(r.body).toMatchObject({ runId: null, note: "run not started yet" });
  });

  it("404s an unknown ticket", async () => {
    ticketsGet.mockResolvedValue(null);

    expect((await callWith("GET", "/tickets/nope/activity", undefined, activityEnv(null))).status).toBe(404);
  });
});

describe("GET /tickets/:id/output", () => {
  /** An env whose live: snapshot and sandbox reads are scriptable. */
  const outputEnv = (live: unknown) =>
    ({
      TICKETS: { get: async () => (live === undefined ? null : JSON.stringify(live)), put: vi.fn() },
      TICKET_WF: { get: async () => ({ status: wfStatus }) },
    }) as never;

  it("reports no run before one has started", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: undefined }));
    const r = await callWith("GET", "/tickets/t1/output", undefined, outputEnv(undefined));

    expect(r.body).toMatchObject({ output: null, note: "no run yet" });
  });

  it("returns null output when there is no live snapshot", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: "def-t1" }));
    const r = await callWith("GET", "/tickets/t1/output", undefined, outputEnv(undefined));

    expect(r.body).toMatchObject({ stage: null, output: null });
  });

  it("reports the current stage and note from the snapshot", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: "def-t1" }));
    const r = await callWith("GET", "/tickets/t1/output", undefined, outputEnv({ phase: "implement", note: "round 2" }));

    expect(r.body).toMatchObject({ stage: "implement", status: "round 2" });
  });

  it("REJECTS a phase that is not a safe identifier", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: "def-t1" }));
    const r = await callWith("GET", "/tickets/t1/output", undefined, outputEnv({ phase: "../../etc/passwd" }));

    // The phase is interpolated into a shell path, so anything outside [\w-]
    // must not reach it.
    expect(r.body).toMatchObject({ stage: null, output: null });
  });

  it("degrades to a note when the sandbox read throws", async () => {
    ticketsGet.mockResolvedValue(ticket({ runId: "def-t1" }));
    const env = {
      TICKETS: {
        get: async () => {
          throw new Error("KV down");
        },
      },
    } as never;

    const r = await callWith("GET", "/tickets/t1/output", undefined, env);
    expect(String(r.body.note)).toContain("unavailable");
  });
});

describe("acceptance verdicts", () => {
  it("accepts a ticket awaiting acceptance", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "awaiting-acceptance" }));
    const r = await call("POST", "/tickets/t1/accept", { comment: "looks right" });

    expect(r.body).toMatchObject({ ok: true });
    expect(appendEvents).toHaveBeenCalled();
  });

  it("records a change request", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "awaiting-acceptance" }));
    const r = await call("POST", "/tickets/t1/request-changes", { comment: "the flag is misnamed" });

    expect(r.body).toMatchObject({ ok: true });
  });

  it("REFUSES a ticket that is not awaiting acceptance", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "implementing" }));
    const r = await call("POST", "/tickets/t1/accept", {});

    // Accepting a running ticket would finish a run that is still working.
    expect(r.status).toBe(409);
    expect(appendEvents).not.toHaveBeenCalled();
  });

  it("404s an unknown ticket", async () => {
    ticketsGet.mockResolvedValue(null);

    expect((await call("POST", "/tickets/nope/accept", {})).status).toBe(404);
  });

  it("wakes the parked run so it can finish", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "awaiting-acceptance" }));
    await call("POST", "/tickets/t1/accept", {});

    // The verdict is worthless if the parked workflow never learns of it.
    expect(wakeTicket).toHaveBeenCalled();
  });

  it("accepts with no comment", async () => {
    ticketsGet.mockResolvedValue(ticket({ status: "awaiting-acceptance" }));

    expect((await call("POST", "/tickets/t1/accept", {})).body).toMatchObject({ ok: true });
  });
});

describe("GET /tickets", () => {
  it("lists tickets", async () => {
    ticketsList.mockResolvedValue([ticket()]);

    expect((await call("GET", "/tickets")).body).toMatchObject({ tickets: [{ id: "t1" }] });
  });
});

describe("GET /repos", () => {
  it("lists the repos the fleet has worked", async () => {
    knownRepos.mockResolvedValue(["acme/widgets"]);

    expect((await call("GET", "/repos")).body).toMatchObject({ repos: ["acme/widgets"] });
  });
});
