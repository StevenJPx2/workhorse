// The trace index — the queryable pointer to each archived trace blob.
//
// The body itself is an immutable R2 blob; only this index is relational.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db";

let db: Db;

beforeEach(async () => {
  db = createDb(env.DB);
});

describe("trace index", () => {
  it("lists a ticket's traces by archive time", async () => {
    await db.traces.insert({ ticketId: "t1", runId: "r2", kind: "run", archivedAt: "2026-07-02T00:00:00.000Z" });
    await db.traces.insert({ ticketId: "t1", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" });

    expect((await db.traces.list("t1")).map((t) => t.runId)).toEqual(["r1", "r2"]);
  });

  it("is idempotent on (ticketId, runId)", async () => {
    const row = { ticketId: "t1", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" };
    await db.traces.insert(row);
    await db.traces.insert({ ...row, archivedAt: "2026-07-09T00:00:00.000Z" });

    // Re-archiving the same run must not error or double-count. The first
    // archive time stands.
    const list = await db.traces.list("t1");
    expect(list).toHaveLength(1);
    expect(list[0].archivedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("scopes to the ticket", async () => {
    await db.traces.insert({ ticketId: "t1", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" });
    await db.traces.insert({ ticketId: "t2", runId: "r1", kind: "run", archivedAt: "2026-07-01T00:00:00.000Z" });

    expect(await db.traces.list("t1")).toHaveLength(1);
  });

  it("returns empty for an unknown ticket", async () => {
    expect(await db.traces.list("ghost")).toEqual([]);
  });
});
