// Escalations and the trace index — the run's model history and the queryable
// pointer to each archived trace blob.

import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { applySchema, env } from "./setup";

let db: Db;

beforeEach(async () => {
  await applySchema();
  db = new Db(env.DB);
});

describe("escalations", () => {
  it("returns a run's escalations chronologically", async () => {
    await db.insertEscalation({
      ticketId: "t1",
      runId: "r1",
      trigger: "promotion",
      detail: "budget spent",
      at: "2026-07-02T00:00:00.000Z",
    });
    await db.insertEscalation({
      ticketId: "t1",
      runId: "r1",
      trigger: "fallback",
      detail: "429",
      at: "2026-07-01T00:00:00.000Z",
    });

    expect((await db.runEscalations("t1", "r1")).map((e) => e.trigger)).toEqual(["fallback", "promotion"]);
  });

  it("scopes to one run", async () => {
    await db.insertEscalation({ ticketId: "t1", runId: "r1", trigger: "fallback", detail: "a", at: "2026-07-01T00:00:00.000Z" });
    await db.insertEscalation({ ticketId: "t1", runId: "r2", trigger: "fallback", detail: "b", at: "2026-07-01T00:00:00.000Z" });

    expect(await db.runEscalations("t1", "r1")).toHaveLength(1);
  });

  it("maps absent stage and toModel to undefined", async () => {
    await db.insertEscalation({ ticketId: "t1", runId: "r1", trigger: "fallback", detail: "x", at: "2026-07-01T00:00:00.000Z" });

    const [e] = await db.runEscalations("t1", "r1");
    expect(e.stage).toBeUndefined();
    expect(e.toModel).toBeUndefined();
  });

  it("keeps stage and toModel when present", async () => {
    await db.insertEscalation({
      ticketId: "t1",
      runId: "r1",
      trigger: "promotion",
      detail: "stalled",
      stage: "implement",
      toModel: "anthropic/claude-opus-4",
      at: "2026-07-01T00:00:00.000Z",
    });

    const [e] = await db.runEscalations("t1", "r1");
    expect(e.stage).toBe("implement");
    expect(e.toModel).toBe("anthropic/claude-opus-4");
  });

  it("allows repeated identical escalations", async () => {
    const row = { ticketId: "t1", runId: "r1", trigger: "fallback", detail: "429", at: "2026-07-01T00:00:00.000Z" };
    await db.insertEscalation(row);
    await db.insertEscalation(row);

    // Two 429s in one run is real history, not a duplicate to collapse.
    expect(await db.runEscalations("t1", "r1")).toHaveLength(2);
  });

  it("returns empty for a run with none", async () => {
    expect(await db.runEscalations("t1", "r1")).toEqual([]);
  });
});

describe("trace index", () => {
  it("lists a ticket's traces by archive time", async () => {
    await db.insertTraceIndex({ ticketId: "t1", runId: "r2", kind: "run", archivedAt: "2026-07-02T00:00:00.000Z" });
    await db.insertTraceIndex({ ticketId: "t1", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" });

    expect((await db.listTraceIndex("t1")).map((t) => t.runId)).toEqual(["r1", "r2"]);
  });

  it("is idempotent on (ticketId, runId)", async () => {
    const row = { ticketId: "t1", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" };
    await db.insertTraceIndex(row);
    await db.insertTraceIndex({ ...row, archivedAt: "2026-07-09T00:00:00.000Z" });

    // Re-archiving the same run must not error or double-count. The first
    // archive time stands.
    const list = await db.listTraceIndex("t1");
    expect(list).toHaveLength(1);
    expect(list[0].archivedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("scopes to the ticket", async () => {
    await db.insertTraceIndex({ ticketId: "t1", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" });
    await db.insertTraceIndex({ ticketId: "t2", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" });

    expect(await db.listTraceIndex("t1")).toHaveLength(1);
  });

  it("returns empty for an unknown ticket", async () => {
    expect(await db.listTraceIndex("ghost")).toEqual([]);
  });
});
