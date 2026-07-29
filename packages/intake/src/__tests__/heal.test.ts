// Self-healing: re-dispatching a dead ticket.
//
// Untested until now, which is why fallow scored it at 0% coverage. Two guards
// here carry real cost if they are wrong: healing a ticket whose instance is
// still alive DOUBLE-DRIVES it (two agents on one branch), and healing a
// deterministic failure burns tokens on a run that will fail identically.

import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketsGet = vi.fn<() => Promise<unknown>>();
const ticketsPatch = vi.fn();
const tracesList = vi.fn<() => Promise<unknown[]>>(async () => []);
const wfCreate = vi.fn();
const wfStatus = vi.fn<() => Promise<{ status?: string }>>();

vi.mock("@workhorse/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workhorse/db")>()),
  db: () => ({
    tickets: { get: ticketsGet, patch: ticketsPatch },
    traces: { list: tracesList },
  }),
}));

const { healTicket } = await import("../heal");

const env = {
  TICKET_WF: {
    create: wfCreate,
    get: async () => ({ status: wfStatus }),
  },
} as never;

/** An errored ticket, the only status that heals. */
const errored = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Fix login",
  repo: "https://github.com/acme/widgets.git",
  prompt: "the button does nothing",
  status: "errored",
  workflow: "coding",
  wfInstance: "t1",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  tracesList.mockResolvedValue([]);
  // Default: the instance is dead, so a heal may proceed.
  wfStatus.mockResolvedValue({ status: "errored" });
});

describe("eligibility", () => {
  it("heals an errored ticket", async () => {
    ticketsGet.mockResolvedValue(errored());

    expect(await healTicket(env, "t1")).toEqual({ ok: true, instance: "t1-h1" });
  });

  it("refuses a ticket that does not exist", async () => {
    ticketsGet.mockResolvedValue(null);

    expect(await healTicket(env, "nope")).toMatchObject({ ok: false, reason: "not found" });
    expect(wfCreate).not.toHaveBeenCalled();
  });

  it("refuses a ticket that is not errored", async () => {
    for (const status of ["queued", "implementing", "in-review", "done", "terminated"]) {
      ticketsGet.mockResolvedValue(errored({ status }));
      const r = await healTicket(env, "t1");

      expect(r.ok).toBe(false);
      expect(r.reason).toContain(status);
    }
    expect(wfCreate).not.toHaveBeenCalled();
  });

  it("stops at the heal limit", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 3 }));
    const r = await healTicket(env, "t1");

    // Otherwise a permanently-broken ticket re-dispatches forever on the cron.
    expect(r).toMatchObject({ ok: false });
    expect(r.reason).toContain("heal limit");
    expect(wfCreate).not.toHaveBeenCalled();
  });

  it("allows the last attempt below the limit", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 2 }));

    expect(await healTicket(env, "t1")).toEqual({ ok: true, instance: "t1-h3" });
  });
});

describe("deterministic-failure guard", () => {
  it("refuses a second heal when the run itself FAILED", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 1, error: "run ended failed" }));
    tracesList.mockResolvedValue([{ kind: "def-failed" }]);

    // Healing retries INFRASTRUCTURE deaths. A control/schema violation fails
    // identically every time, so re-dispatching only burns tokens.
    const r = await healTicket(env, "t1");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("deterministic");
  });

  it("still heals a FIRST failure — it may have been infrastructure", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 0, error: "run ended failed" }));
    tracesList.mockResolvedValue([{ kind: "def-failed" }]);

    expect(await healTicket(env, "t1")).toMatchObject({ ok: true });
  });

  it("heals a repeat death that is NOT a failed run", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 2, error: "sandbox evicted" }));

    // Sandbox eviction, token expiry, and worker deploys are exactly what heal is
    // for, however many times they happen.
    expect(await healTicket(env, "t1")).toMatchObject({ ok: true });
  });

  it("heals when the last trace did not end in failure", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 1, error: "run ended failed" }));
    tracesList.mockResolvedValue([{ kind: "def-complete" }]);

    expect(await healTicket(env, "t1")).toMatchObject({ ok: true });
  });
});

describe("liveness check", () => {
  it("refuses while the instance is still running", async () => {
    ticketsGet.mockResolvedValue(errored());
    wfStatus.mockResolvedValue({ status: "running" });

    // The guard that matters most: two instances on one branch means two agents
    // committing over each other.
    const r = await healTicket(env, "t1");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("running");
    expect(wfCreate).not.toHaveBeenCalled();
  });

  it("proceeds for every genuinely finished status", async () => {
    for (const status of ["errored", "terminated", "complete"]) {
      vi.clearAllMocks();
      ticketsGet.mockResolvedValue(errored());
      wfStatus.mockResolvedValue({ status });

      expect(await healTicket(env, "t1")).toMatchObject({ ok: true });
    }
  });

  it("proceeds when the instance cannot be reached at all", async () => {
    ticketsGet.mockResolvedValue(errored());
    wfStatus.mockRejectedValue(new Error("no such instance"));

    // No instance means definitely dead.
    expect(await healTicket(env, "t1")).toMatchObject({ ok: true });
  });

  it("checks the RECORDED instance, not the ticket id", async () => {
    ticketsGet.mockResolvedValue(errored({ wfInstance: "t1-h1" }));
    const get = vi.fn(async () => ({ status: wfStatus }));

    await healTicket({ TICKET_WF: { create: wfCreate, get } } as never, "t1");

    // After a previous heal the live instance is t1-hN; checking t1 would look at
    // a corpse and conclude it is safe to dispatch again.
    expect(get).toHaveBeenCalledWith("t1-h1");
  });
});

describe("the new instance", () => {
  it("names instances by attempt", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 1 }));

    expect(await healTicket(env, "t1")).toEqual({ ok: true, instance: "t1-h2" });
  });

  it("resumes rather than starting over", async () => {
    ticketsGet.mockResolvedValue(errored());
    await healTicket(env, "t1");

    // The branch, PR, and events survive; re-running from scratch would discard
    // work already on GitHub.
    expect(wfCreate.mock.calls[0][0].params).toMatchObject({ resume: true });
  });

  it("carries the ticket's own workflow", async () => {
    ticketsGet.mockResolvedValue(errored({ workflow: "coding-raw" }));
    await healTicket(env, "t1");

    expect(wfCreate.mock.calls[0][0].params).toMatchObject({ workflow: "coding-raw" });
  });

  it("passes an EMPTY token so the custodian's is used", async () => {
    ticketsGet.mockResolvedValue(errored());
    await healTicket(env, "t1");

    // A heal can happen hours later; the token recorded at filing is long expired.
    expect(wfCreate.mock.calls[0][0].params.accessToken).toBe("");
  });

  it("repoints the record at the new instance and clears the error", async () => {
    ticketsGet.mockResolvedValue(errored({ healAttempts: 1 }));
    await healTicket(env, "t1");

    expect(ticketsPatch).toHaveBeenCalledWith("t1", {
      wfInstance: "t1-h2",
      healAttempts: 2,
      status: "queued",
      error: undefined,
    });
  });

  it("creates the instance BEFORE patching the record", async () => {
    const order: string[] = [];
    wfCreate.mockImplementation(async () => void order.push("create"));
    ticketsPatch.mockImplementation(async () => void order.push("patch"));
    ticketsGet.mockResolvedValue(errored());

    await healTicket(env, "t1");

    // If the patch landed first and create then failed, the ticket would read as
    // queued with nothing driving it.
    expect(order).toEqual(["create", "patch"]);
  });
});
