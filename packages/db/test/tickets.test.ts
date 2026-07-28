// Ticket queries against a real D1. These assert BEHAVIOUR (what comes back),
// not the SQL text — the point of the ORM is that the SQL is generated, so
// pinning it would test drizzle rather than us.

import type { TicketRecord } from "@workhorse/api";
import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { applySchema, env } from "./setup";

const ticket = (over: Partial<TicketRecord> = {}): TicketRecord => ({
  id: "t1",
  title: "Fix login",
  repo: "https://github.com/acme/widgets.git",
  prompt: "the login button does nothing",
  status: "queued",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

let db: Db;

beforeEach(async () => {
  await applySchema();
  db = new Db(env.DB);
});

describe("tickets", () => {
  it("round-trips a minimal ticket", async () => {
    await db.tickets.put(ticket());
    const got = await db.tickets.get("t1");

    expect(got).toEqual(ticket());
  });

  it("returns null for an unknown id rather than throwing", async () => {
    expect(await db.tickets.get("nope")).toBeNull();
  });

  it("maps absent optional columns to undefined, not null", async () => {
    await db.tickets.put(ticket());
    const got = await db.tickets.get("t1");

    // The API contract is `field?: string`, so a caller checking `if (t.plan)`
    // must not receive null — JSON.stringify would then emit "plan":null.
    expect(got?.plan).toBeUndefined();
    expect(got?.prUrl).toBeUndefined();
    expect(got?.error).toBeUndefined();
    expect("plan" in (got as object)).toBe(true);
  });

  it("treats healAttempts 0 as absent", async () => {
    await db.tickets.put(ticket());
    const got = await db.tickets.get("t1");

    // 0 means "never healed"; surfacing it as 0 would make `?? 3` comparisons
    // read a real value where the API means absence.
    expect(got?.healAttempts).toBeUndefined();
  });

  it("preserves a non-zero healAttempts", async () => {
    await db.tickets.put(ticket({ healAttempts: 2 }));
    expect((await db.tickets.get("t1"))?.healAttempts).toBe(2);
  });

  it("persists every optional field when set", async () => {
    const full = ticket({
      plan: "1. look 2. fix",
      result: "shipped",
      error: "transient",
      branch: "workhorse/t1",
      prUrl: "https://github.com/acme/widgets/pull/7",
      runId: "r1",
      workflow: "coding",
      wfInstance: "t1-h1",
      healAttempts: 1,
    });
    await db.tickets.put(full);

    expect(await db.tickets.get("t1")).toEqual(full);
  });

  it("upserts in place instead of delete+insert", async () => {
    await db.tickets.put(ticket({ plan: "original" }));
    await db.tickets.put(ticket({ plan: "revised", status: "implementing" }));

    const got = await db.tickets.get("t1");
    expect(got?.plan).toBe("revised");
    expect(got?.status).toBe("implementing");
    expect(await db.tickets.list()).toHaveLength(1);
  });
});

describe("patchTicket", () => {
  it("returns prev and next so a hook can diff the transition", async () => {
    await db.tickets.put(ticket({ status: "queued" }));
    const r = await db.tickets.patch("t1", { status: "planning" });

    expect(r?.prev.status).toBe("queued");
    expect(r?.next.status).toBe("planning");
  });

  it("bumps updatedAt", async () => {
    await db.tickets.put(ticket());
    const r = await db.tickets.patch("t1", { status: "planning" });

    expect(r?.next.updatedAt).not.toBe("2026-07-01T00:00:00.000Z");
    expect(Date.parse(r?.next.updatedAt ?? "")).toBeGreaterThan(0);
  });

  it("leaves unpatched fields alone", async () => {
    await db.tickets.put(ticket({ plan: "keep me", branch: "b" }));
    const r = await db.tickets.patch("t1", { status: "in-review" });

    expect(r?.next.plan).toBe("keep me");
    expect(r?.next.branch).toBe("b");
  });

  it("returns null for a missing ticket instead of creating one", async () => {
    expect(await db.tickets.patch("ghost", { status: "done" })).toBeNull();

    // A patch that silently inserted would create a ticket with no prompt.
    expect(await db.tickets.get("ghost")).toBeNull();
  });

  it("can clear an optional field by patching undefined", async () => {
    await db.tickets.put(ticket({ error: "boom" }));
    const r = await db.tickets.patch("t1", { error: undefined });

    expect(r?.next.error).toBeUndefined();
    expect((await db.tickets.get("t1"))?.error).toBeUndefined();
  });
});

describe("listTickets", () => {
  beforeEach(async () => {
    await db.tickets.put(ticket({ id: "old", createdAt: "2026-07-01T00:00:00.000Z", status: "done" }));
    await db.tickets.put(ticket({ id: "mid", createdAt: "2026-07-02T00:00:00.000Z", status: "queued" }));
    await db.tickets.put(ticket({ id: "new", createdAt: "2026-07-03T00:00:00.000Z", status: "queued" }));
  });

  it("orders newest first", async () => {
    expect((await db.tickets.list()).map((t) => t.id)).toEqual(["new", "mid", "old"]);
  });

  it("filters by status", async () => {
    expect((await db.tickets.list("queued")).map((t) => t.id)).toEqual(["new", "mid"]);
  });

  it("returns an empty array for a status with no tickets", async () => {
    expect(await db.tickets.list("terminated")).toEqual([]);
  });
});

describe("knownRepos", () => {
  it("returns distinct repos, most recently updated first", async () => {
    await db.tickets.put(ticket({ id: "a", repo: "r/one", updatedAt: "2026-07-01T00:00:00.000Z" }));
    await db.tickets.put(ticket({ id: "b", repo: "r/two", updatedAt: "2026-07-05T00:00:00.000Z" }));
    await db.tickets.put(ticket({ id: "c", repo: "r/one", updatedAt: "2026-07-09T00:00:00.000Z" }));

    // r/one wins on its LATEST ticket (c), not its first — a plain DISTINCT
    // would order by whichever row the planner saw first.
    expect(await db.tickets.knownRepos()).toEqual(["r/one", "r/two"]);
  });

  it("honours the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await db.tickets.put(ticket({ id: `t${i}`, repo: `r/${i}`, updatedAt: `2026-07-0${i + 1}T00:00:00.000Z` }));
    }
    expect(await db.tickets.knownRepos(2)).toHaveLength(2);
  });

  it("returns empty on an empty table", async () => {
    expect(await db.tickets.knownRepos()).toEqual([]);
  });
});
