// Escalations — the run's model history.
//
// Verified against a real D1: the ordering, the run scoping, and that repeated
// identical escalations are KEPT (two 429s in one run is history, not a dup).

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "#db";

let db: Db;

beforeEach(async () => {
  db = createDb(env.DB);
});

describe("escalations", () => {
  it("returns a run's escalations chronologically", async () => {
    await db.escalations.insert({
      ticketId: "t1",
      runId: "r1",
      trigger: "promotion",
      detail: "budget spent",
      at: "2026-07-02T00:00:00.000Z",
    });
    await db.escalations.insert({
      ticketId: "t1",
      runId: "r1",
      trigger: "fallback",
      detail: "429",
      at: "2026-07-01T00:00:00.000Z",
    });

    expect((await db.escalations.forRun("t1", "r1")).map((e) => e.trigger)).toEqual(["fallback", "promotion"]);
  });

  it("scopes to one run", async () => {
    await db.escalations.insert({ ticketId: "t1", runId: "r1", trigger: "fallback", detail: "a", at: "2026-07-01T00:00:00.000Z" });
    await db.escalations.insert({ ticketId: "t1", runId: "r2", trigger: "fallback", detail: "b", at: "2026-07-01T00:00:00.000Z" });

    expect(await db.escalations.forRun("t1", "r1")).toHaveLength(1);
  });

  it("maps absent stage and toModel to undefined", async () => {
    await db.escalations.insert({ ticketId: "t1", runId: "r1", trigger: "fallback", detail: "x", at: "2026-07-01T00:00:00.000Z" });

    const [e] = await db.escalations.forRun("t1", "r1");
    expect(e.stage).toBeUndefined();
    expect(e.toModel).toBeUndefined();
  });

  it("keeps stage and toModel when present", async () => {
    await db.escalations.insert({
      ticketId: "t1",
      runId: "r1",
      trigger: "promotion",
      detail: "stalled",
      stage: "implement",
      toModel: "anthropic/claude-opus-4",
      at: "2026-07-01T00:00:00.000Z",
    });

    const [e] = await db.escalations.forRun("t1", "r1");
    expect(e.stage).toBe("implement");
    expect(e.toModel).toBe("anthropic/claude-opus-4");
  });

  it("allows repeated identical escalations", async () => {
    const row = { ticketId: "t1", runId: "r1", trigger: "fallback", detail: "429", at: "2026-07-01T00:00:00.000Z" };
    await db.escalations.insert(row);
    await db.escalations.insert(row);

    // Two 429s in one run is real history, not a duplicate to collapse.
    expect(await db.escalations.forRun("t1", "r1")).toHaveLength(2);
  });

  it("returns empty for a run with none", async () => {
    expect(await db.escalations.forRun("t1", "r1")).toEqual([]);
  });
});
