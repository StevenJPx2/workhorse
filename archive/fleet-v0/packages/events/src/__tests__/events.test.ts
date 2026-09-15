// The steer queue — operator → running stage.
//
// `fallow fix` offered to un-export pendingSteers and consumeSteers as unused.
// They WERE unused, and that was the bug: the interpreter's steerWorkflow was
// their only consumer, deleted in 1f165f3. Since then POST /tickets/:id/steer
// answered `ok: true` and the message reached nothing.
//
// These tests cover the append-only + cursor semantics the delivery path relies
// on, so the fix cannot silently regress to the same shape.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { describe, expect, it } from "vitest";
import { appendSteer, consumeSteers, pendingSteers } from "../events";

const env = () => fakeEnv();

describe("appendSteer", () => {
  it("queues a message", async () => {
    const e = env();
    await appendSteer(e, "t1", "use the other library");

    expect(await pendingSteers(e, "t1")).toEqual(["use the other library"]);
  });

  it("appends in order", async () => {
    const e = env();
    await appendSteer(e, "t1", "first");
    await appendSteer(e, "t1", "second");

    expect(await pendingSteers(e, "t1")).toEqual(["first", "second"]);
  });

  it("keeps tickets separate", async () => {
    const e = env();
    await appendSteer(e, "t1", "for one");
    await appendSteer(e, "t2", "for two");

    expect(await pendingSteers(e, "t1")).toEqual(["for one"]);
    expect(await pendingSteers(e, "t2")).toEqual(["for two"]);
  });

  it("caps the log at 50, dropping the OLDEST", async () => {
    const e = env();
    for (let i = 0; i < 55; i++) await appendSteer(e, "t1", `m${i}`);

    const pending = await pendingSteers(e, "t1");
    expect(pending).toHaveLength(50);
    // The newest instruction is the one that matters; an unbounded KV value
    // would eventually exceed the 25 MiB limit and fail the write.
    expect(pending.at(-1)).toBe("m54");
    expect(pending).not.toContain("m0");
  });
});

describe("pendingSteers", () => {
  it("is empty for a ticket with no steers", async () => {
    expect(await pendingSteers(env(), "nobody")).toEqual([]);
  });

  it("returns only what is past the cursor", async () => {
    const e = env();
    await appendSteer(e, "t1", "first");
    await consumeSteers(e, "t1");
    await appendSteer(e, "t1", "second");

    // Re-delivering a consumed steer would make one instruction repeat at every
    // subsequent stage.
    expect(await pendingSteers(e, "t1")).toEqual(["second"]);
  });
});

describe("consumeSteers", () => {
  it("advances the cursor past everything queued", async () => {
    const e = env();
    await appendSteer(e, "t1", "a");
    await appendSteer(e, "t1", "b");
    await consumeSteers(e, "t1");

    expect(await pendingSteers(e, "t1")).toEqual([]);
  });

  it("is idempotent", async () => {
    const e = env();
    await appendSteer(e, "t1", "a");
    await consumeSteers(e, "t1");
    await consumeSteers(e, "t1");

    expect(await pendingSteers(e, "t1")).toEqual([]);
  });

  it("is safe on a ticket with no steers", async () => {
    await expect(consumeSteers(env(), "nobody")).resolves.toBeUndefined();
  });

  it("does NOT consume a steer queued after it ran", async () => {
    const e = env();
    await consumeSteers(e, "t1");
    await appendSteer(e, "t1", "late arrival");

    // The race that matters: an operator steering while a stage is starting.
    expect(await pendingSteers(e, "t1")).toEqual(["late arrival"]);
  });

  it("preserves the full log — the cursor moves, history does not shrink", async () => {
    const e = env();
    await appendSteer(e, "t1", "a");
    await consumeSteers(e, "t1");

    // Append-only: the trace of what an operator asked for stays readable.
    expect(JSON.parse((await e.TICKETS.get("steers:t1")) ?? "[]")).toEqual(["a"]);
  });
});
