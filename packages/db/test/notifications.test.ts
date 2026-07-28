// The notification bus. Sequence allocation and the boolean column are the two
// things that were hand-rolled before and are easy to get subtly wrong.

import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db";
import { applySchema, env } from "./setup";

let db: Db;

beforeEach(async () => {
  await applySchema();
  db = new Db(env.DB);
});

describe("sequence allocation", () => {
  it("starts at 1 for a ticket's first notification", async () => {
    const n = await db.notifications.queue({ ticketId: "t1", source: "ui", body: "hello" });
    expect(n.seq).toBe(1);
  });

  it("increments per ticket", async () => {
    await db.notifications.queue({ ticketId: "t1", source: "ui", body: "one" });
    await db.notifications.queue({ ticketId: "t1", source: "ui", body: "two" });
    const third = await db.notifications.queue({ ticketId: "t1", source: "ui", body: "three" });

    expect(third.seq).toBe(3);
  });

  it("counts sequences independently per ticket", async () => {
    await db.notifications.queue({ ticketId: "t1", source: "ui", body: "a" });
    await db.notifications.queue({ ticketId: "t1", source: "ui", body: "b" });
    const other = await db.notifications.queue({ ticketId: "t2", source: "ui", body: "c" });

    // A global counter would give this 3 and leak one ticket's volume into
    // another's numbering.
    expect(other.seq).toBe(1);
  });

  it("survives concurrent queueing without a primary-key collision", async () => {
    // The seq is allocated inside the INSERT, so parallel calls cannot both read
    // the same MAX. A read-then-write would throw UNIQUE constraint failed here.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => db.notifications.queue({ ticketId: "t1", source: "ui", body: `n${i}` })),
    );

    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("fields", () => {
  it("returns urgent as a boolean, not 0/1", async () => {
    const n = await db.notifications.queue({ ticketId: "t1", source: "ui", body: "x", urgent: true });

    // SQLite stores an integer; the old layer compared `urgent === 1` at every
    // read site, and one missed site silently made every notification urgent.
    expect(n.urgent).toBe(true);
    expect((await db.notifications.unread("t1"))[0].urgent).toBe(true);
  });

  it("defaults urgent to false and kind to comment", async () => {
    const n = await db.notifications.queue({ ticketId: "t1", source: "ui", body: "x" });

    expect(n.urgent).toBe(false);
    expect(n.kind).toBe("comment");
  });

  it("truncates the body at 8000 chars", async () => {
    const n = await db.notifications.queue({ ticketId: "t1", source: "ui", body: "x".repeat(9000) });
    expect(n.body).toHaveLength(8000);
  });

  it("stores an absent author as null", async () => {
    const n = await db.notifications.queue({ ticketId: "t1", source: "ui", body: "x" });
    expect(n.author).toBeNull();
  });
});

describe("read receipts", () => {
  beforeEach(async () => {
    for (const body of ["one", "two", "three"]) {
      await db.notifications.queue({ ticketId: "t1", source: "ui", body });
    }
  });

  it("returns everything unread, oldest first", async () => {
    expect((await db.notifications.unread("t1")).map((n) => n.body)).toEqual(["one", "two", "three"]);
  });

  it("marks up to a seq and leaves later ones unread", async () => {
    await db.notifications.markRead("t1", 2);
    expect((await db.notifications.unread("t1")).map((n) => n.body)).toEqual(["three"]);
  });

  it("does not overwrite an existing receipt", async () => {
    await db.notifications.markRead("t1", 1);
    const first = (await db.notifications.list("t1")).find((n) => n.seq === 1);

    await db.notifications.markRead("t1", 3);
    const again = (await db.notifications.list("t1")).find((n) => n.seq === 1);

    // The FIRST read is the one that consumed it; re-stamping would lose when
    // the operator's input actually reached a stage.
    expect(again?.readAt).toBe(first?.readAt);
  });

  it("leaves another ticket's queue untouched", async () => {
    await db.notifications.queue({ ticketId: "t2", source: "ui", body: "other" });
    await db.notifications.markRead("t1", 3);

    expect(await db.notifications.unread("t2")).toHaveLength(1);
  });
});

describe("listNotifications", () => {
  it("returns newest first, including read ones", async () => {
    for (const body of ["one", "two"]) {
      await db.notifications.queue({ ticketId: "t1", source: "ui", body });
    }
    await db.notifications.markRead("t1", 2);

    const all = await db.notifications.list("t1");
    expect(all.map((n) => n.body)).toEqual(["two", "one"]);
    expect(all.every((n) => n.readAt !== null)).toBe(true);
  });

  it("honours the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await db.notifications.queue({ ticketId: "t1", source: "ui", body: `n${i}` });
    }
    expect(await db.notifications.list("t1", 2)).toHaveLength(2);
  });
});
