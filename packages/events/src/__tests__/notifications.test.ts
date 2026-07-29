// The external event bus and the notification queue.
//
// The steer half is covered in events.test.ts; this covers the two planes it sits
// beside. `wakeTicket` is the one with a real subtlety: it RETRIES, because an
// event landing between a workflow's pre-park check and its waitForEvent
// registration is otherwise lost silently.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ticketsGet = vi.fn(async () => ({ id: "t1", wfInstance: "t1" }));

vi.mock("@workhorse/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workhorse/db")>()),
  db: () => ({ tickets: { get: ticketsGet } }),
}));
import { appendEvents, consumeEvents, unconsumedEvents, wakeTicket } from "../events";
import { renderNotifications } from "../notifications";

const event = (over: Record<string, unknown> = {}) => ({
  ticketId: "t1",
  kind: "pr-merged",
  summary: "PR #7 merged",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("appendEvents", () => {
  it("appends an event", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event()] as never);

    expect(await unconsumedEvents(env, "t1")).toHaveLength(1);
  });

  it("appends several for one ticket in order", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event({ summary: "first" }), event({ summary: "second" })] as never);

    expect((await unconsumedEvents(env, "t1")).map((e) => e.summary)).toEqual(["first", "second"]);
  });

  it("routes a mixed batch to the right tickets", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event(), event({ ticketId: "t2", summary: "other" })] as never);

    // One webhook can carry events for several tickets; cross-filing them would
    // wake the wrong run.
    expect(await unconsumedEvents(env, "t1")).toHaveLength(1);
    expect((await unconsumedEvents(env, "t2"))[0].summary).toBe("other");
  });

  it("accumulates across calls", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event({ summary: "first" })] as never);
    await appendEvents(env, [event({ summary: "second" })] as never);

    expect(await unconsumedEvents(env, "t1")).toHaveLength(2);
  });

  it("caps the log at 200, keeping the newest", async () => {
    const env = fakeEnv();
    for (let i = 0; i < 205; i++) await appendEvents(env, [event({ summary: `e${i}` })] as never);

    const all = await unconsumedEvents(env, "t1");
    expect(all).toHaveLength(200);
    expect(all.at(-1)?.summary).toBe("e204");
  });

  it("is a no-op for an empty batch", async () => {
    const env = fakeEnv();
    await appendEvents(env, []);

    expect(await unconsumedEvents(env, "t1")).toEqual([]);
  });
});

describe("the consumed cursor", () => {
  it("returns nothing for a ticket with no events", async () => {
    expect(await unconsumedEvents(fakeEnv(), "nobody")).toEqual([]);
  });

  it("returns only what is past the cursor", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event({ summary: "old" })] as never);
    await consumeEvents(env, "t1");
    await appendEvents(env, [event({ summary: "new" })] as never);

    expect((await unconsumedEvents(env, "t1")).map((e) => e.summary)).toEqual(["new"]);
  });

  it("is idempotent", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event()] as never);
    await consumeEvents(env, "t1");
    await consumeEvents(env, "t1");

    expect(await unconsumedEvents(env, "t1")).toEqual([]);
  });

  it("keeps the full log — the cursor moves, history does not shrink", async () => {
    const env = fakeEnv();
    await appendEvents(env, [event()] as never);
    await consumeEvents(env, "t1");

    expect(JSON.parse((await env.TICKETS.get("events:t1")) ?? "[]")).toHaveLength(1);
  });
});

describe("wakeTicket", () => {
  beforeEach(() => vi.useFakeTimers());

  /** An env whose workflow instance records every sendEvent. */
  function wakeEnv(options: { getThrows?: boolean; wfInstance?: string } = {}) {
    const sendEvent = vi.fn(async () => {});
    const get = vi.fn(async () => {
      if (options.getThrows) throw new Error("not parked");
      return { sendEvent };
    });

    return { env: fakeEnv({ TICKET_WF: { get } }) as never, get, sendEvent };
  }

  it("retries rather than waking once", async () => {
    const { env, sendEvent } = wakeEnv();

    const done = wakeTicket(env, "t1", 3);
    // It sleeps AFTER each attempt, so three attempts span two full intervals
    // plus a trailing one.
    await vi.advanceTimersByTimeAsync(60_000);
    await done;

    // A single sendEvent is silently lost if it lands in the window between the
    // workflow's pre-park event check and its waitForEvent registration.
    expect(sendEvent).toHaveBeenCalledTimes(3);
  });

  it("does not throw when the instance is gone", async () => {
    const { env } = wakeEnv({ getThrows: true });

    const done = wakeTicket(env, "t1", 2);
    await vi.advanceTimersByTimeAsync(30_000);

    // A finished ticket is not an error — the wake is best-effort.
    await expect(done).resolves.toBeUndefined();
  });
});

describe("renderNotifications", () => {
  const note = (over: Record<string, unknown> = {}) => ({
    seq: 1,
    ticketId: "t1",
    source: "github",
    kind: "comment",
    author: "alice",
    body: "please rename the flag",
    createdAt: "2026-07-29T00:00:00.000Z",
    ...over,
  });

  it("renders a notification with its source and author", () => {
    const out = renderNotifications([note()] as never);

    expect(out).toContain("github");
    expect(out).toContain("alice");
    expect(out).toContain("please rename the flag");
  });

  it("renders several", () => {
    const out = renderNotifications([note(), note({ seq: 2, body: "and this" })] as never);

    expect(out).toContain("please rename the flag");
    expect(out).toContain("and this");
  });

  it("omits the author when there is none", () => {
    expect(renderNotifications([note({ author: undefined })] as never)).not.toContain("undefined");
  });

  it("returns an empty string for no notifications", () => {
    expect(renderNotifications([])).toBe("");
  });
});
