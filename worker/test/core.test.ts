// The Core facade — the services a plugin sees.
//
// Untested until now, which is why fallow scored these at 0% coverage. Two things
// here carry real policy: script registration (seed protection and provenance) and
// fireHook's isolation (one bad plugin must not break a ticket transition).

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scriptsGet = vi.fn<() => Promise<unknown>>(async () => null);
const scriptsUpsert = vi.fn();
const ticketsGet = vi.fn(async () => null);
const ticketsList = vi.fn(async () => []);
const indexUpsert = vi.fn();

vi.mock("../src/db", () => ({
  db: () => ({
    scripts: { get: scriptsGet, upsert: scriptsUpsert },
    tickets: { get: ticketsGet, list: ticketsList },
  }),
}));

vi.mock("../src/semindex", () => ({
  scriptIndex: { upsert: indexUpsert },
  workflowIndex: { query: async () => [] },
}));

const hooks: Array<{ id: string; fn: (...a: unknown[]) => Promise<void> }> = [];
const providers = new Map<string, { kind: string; resolve: (...a: unknown[]) => Promise<unknown> }>();

vi.mock("../src/registry", () => ({
  attachmentProviders: () => providers,
  get plugins() {
    return hooks.map((h) => ({ id: h.id, hooks: { onStatusChange: h.fn } }));
  },
}));

vi.mock("../src/chat", () => ({ runFleetChat: vi.fn(async () => ({ ok: true, reply: "hi" })) }));

const { coreFor, fireHook } = await import("../src/core");

const draft = (over: Record<string, unknown> = {}) => ({
  scope: "global",
  name: "run_tests",
  description: "run the suite",
  code: "return 1;",
  args: [],
  statusGates: [],
  createdBy: "agent" as const,
  ...over,
});

const env = fakeEnv();
const core = () => coreFor(env, "https://workhorse.test");

beforeEach(() => {
  vi.clearAllMocks();
  scriptsGet.mockResolvedValue(null);
  hooks.length = 0;
  providers.clear();
});

describe("registerScript", () => {
  it("registers a new script", async () => {
    const r = await core().registerScript(draft());

    expect(r.ok).toBe(true);
    expect(scriptsUpsert).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid draft WITHOUT writing", async () => {
    const r = await core().registerScript(draft({ name: "Bad Name" }));

    expect(r).toMatchObject({ ok: false });
    expect(scriptsUpsert).not.toHaveBeenCalled();
  });

  it("stamps createdAt and updatedAt on a new script", async () => {
    await core().registerScript(draft());

    const stored = scriptsUpsert.mock.calls[0][0] as { createdAt: string; updatedAt: string };
    expect(stored.createdAt).toBe(stored.updatedAt);
  });

  it("preserves createdAt when updating", async () => {
    scriptsGet.mockResolvedValue({ ...draft(), createdAt: "2026-01-01T00:00:00.000Z", createdBy: "agent" });
    await core().registerScript(draft({ code: "return 2;" }));

    const stored = scriptsUpsert.mock.calls[0][0] as { createdAt: string; updatedAt: string };
    expect(stored.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(stored.updatedAt).not.toBe(stored.createdAt);
  });

  it("refuses to let an AGENT overwrite a seeded script", async () => {
    scriptsGet.mockResolvedValue({ ...draft(), createdBy: "seed", createdAt: "2026-01-01T00:00:00.000Z" });
    const r = await core().registerScript(draft({ createdBy: "agent" }));

    // A seed is a curated, human-authored entry. An agent silently replacing one
    // would change behaviour nobody asked to change.
    expect(r).toMatchObject({ ok: false });
    expect(String((r as { error: string }).error)).toContain("seeded script");
    expect(scriptsUpsert).not.toHaveBeenCalled();
  });

  it("lets a USER overwrite a seeded script, keeping the seed provenance", async () => {
    scriptsGet.mockResolvedValue({ ...draft(), createdBy: "seed", createdAt: "2026-01-01T00:00:00.000Z" });
    const r = await core().registerScript(draft({ createdBy: "user" }));

    expect(r.ok).toBe(true);
    // Still marked as a seed, so the next agent write is still refused.
    expect((scriptsUpsert.mock.calls[0][0] as { createdBy: string }).createdBy).toBe("seed");
  });

  it("keeps the registration when the semantic index fails", async () => {
    indexUpsert.mockRejectedValue(new Error("Vectorize down"));
    const r = await core().registerScript(draft());

    // The index is a discovery nicety. Failing the write because it could not be
    // indexed would lose the agent's work.
    expect(r.ok).toBe(true);
    expect(scriptsUpsert).toHaveBeenCalledTimes(1);
  });

  it("indexes the stored script, not the raw draft", async () => {
    await core().registerScript(draft());

    const indexed = (indexUpsert.mock.calls[0][1] as Array<{ updatedAt?: string }>)[0];
    expect(indexed.updatedAt).toBeTruthy();
  });
});

describe("resolveAttachment", () => {
  it("returns null for an unknown kind", async () => {
    expect(await core().resolveAttachment("nope", "x")).toBeNull();
  });

  it("delegates to the provider", async () => {
    providers.set("jira", { kind: "jira", resolve: async () => ({ title: "PROJ-42", content: "body" }) });

    expect(await core().resolveAttachment("jira", "PROJ-42")).toMatchObject({ title: "PROJ-42" });
  });

  it("returns null when the provider throws", async () => {
    providers.set("jira", {
      kind: "jira",
      resolve: async () => {
        throw new Error("Jira 500");
      },
    });

    // An unreachable third party must degrade to "no context", not fail the run.
    expect(await core().resolveAttachment("jira", "PROJ-42")).toBeNull();
  });

  it("hands the provider a working Core", async () => {
    let received: unknown;
    providers.set("jira", {
      kind: "jira",
      resolve: async (_env, c) => {
        received = c;
        return { title: "t", content: "c" };
      },
    });

    await core().resolveAttachment("jira", "X");
    expect(typeof (received as { getTicket?: unknown })?.getTicket).toBe("function");
  });
});

describe("fireHook", () => {
  const info = {
    ticketId: "t1",
    from: "queued" as const,
    to: "planning" as const,
    record: { id: "t1" } as never,
  };

  it("calls every plugin's hook", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    hooks.push({ id: "a", fn: a }, { id: "b", fn: b });

    await fireHook(env, "https://w.test", "onStatusChange", info);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("continues past a throwing plugin", async () => {
    const boom = vi.fn(async () => {
      throw new Error("plugin exploded");
    });
    const after = vi.fn(async () => {});
    hooks.push({ id: "boom", fn: boom }, { id: "after", fn: after });

    // Best-effort by design: a broken notifier must not block a ticket
    // transition, and must not stop the plugins registered after it.
    await expect(fireHook(env, "https://w.test", "onStatusChange", info)).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("is a no-op with no plugins registered for the hook", async () => {
    await expect(fireHook(env, "https://w.test", "onStatusChange", info)).resolves.toBeUndefined();
  });

  it("passes env, a Core, and the info through", async () => {
    const seen: unknown[] = [];
    hooks.push({
      id: "spy",
      fn: async (...args) => {
        seen.push(...args);
      },
    });

    await fireHook(env, "https://w.test", "onStatusChange", info);

    expect(seen[0]).toBe(env);
    expect(typeof (seen[1] as { getTicket?: unknown })?.getTicket).toBe("function");
    expect(seen[2]).toMatchObject({ ticketId: "t1", to: "planning" });
  });
});

describe("ticket services", () => {
  it("reads a ticket through the db", async () => {
    await core().getTicket("t1");
    expect(ticketsGet).toHaveBeenCalledWith("t1");
  });

  it("passes a status filter through", async () => {
    await core().listTickets("errored");
    expect(ticketsList).toHaveBeenCalledWith("errored");
  });

  it("reads a stored diff from KV", async () => {
    await env.TICKETS.put("diff:t1", "a diff");
    expect(await core().ticketDiff("t1")).toBe("a diff");
  });

  it("returns null for a ticket with no stored diff", async () => {
    expect(await core().ticketDiff("nope")).toBeNull();
  });
});
