// The event vocabulary.
//
// These builders exist so field names cannot drift between call sites — a query
// for "how long does the review stage take" breaks the moment one site writes
// `stageId` where another wrote `stage`. The tests pin exactly that.

import { describe, expect, it } from "vitest";
import { stageEvent, ticketEvent } from "../events";

describe("ticketEvent", () => {
  it("keeps the identity fields", () => {
    const e = ticketEvent({ ticketId: "t1", runId: "def-t1", repo: "acme/x", event: "dispatched" });

    expect(e).toEqual({ ticketId: "t1", runId: "def-t1", repo: "acme/x", event: "dispatched" });
  });

  it("puts ticketId first so a log line reads identity-first", () => {
    const keys = Object.keys(ticketEvent({ ticketId: "t1", event: "filed", extra: 1 }));

    expect(keys[0]).toBe("ticketId");
  });

  it("OMITS runId rather than emitting undefined", () => {
    const e = ticketEvent({ ticketId: "t1", event: "filed" });

    // A present-but-undefined field indexes as a real field with a null value,
    // which makes "runs that have no runId" indistinguishable from "runs where
    // we forgot to set it".
    expect("runId" in e).toBe(false);
  });

  it("omits repo when absent", () => {
    expect("repo" in ticketEvent({ ticketId: "t1", event: "filed" })).toBe(false);
  });

  it("carries arbitrary extra fields", () => {
    const e = ticketEvent({ ticketId: "t1", event: "healed", instance: "t1-h1", attempt: 2 });

    expect(e).toMatchObject({ instance: "t1-h1", attempt: 2 });
  });

  it("does not let an extra field overwrite the identity", () => {
    const e = ticketEvent({ ticketId: "t1", event: "filed", ticketId2: "t2" } as never);

    expect(e.ticketId).toBe("t1");
  });
});

describe("stageEvent", () => {
  it("carries the stage alongside the ticket identity", () => {
    const e = stageEvent({ ticketId: "t1", runId: "r1", stage: "review", event: "stage-running" });

    expect(e).toEqual({ ticketId: "t1", runId: "r1", stage: "review", event: "stage-running" });
  });

  it("includes the round when given", () => {
    const e = stageEvent({ ticketId: "t1", stage: "implement", round: 2, event: "stage-complete" });

    expect(e).toMatchObject({ stage: "implement", round: 2 });
  });

  it("includes round 0 — it is a real round, not a missing one", () => {
    // `round && {...}` would drop this; the check must be against undefined.
    expect(stageEvent({ ticketId: "t1", stage: "plan", round: 0, event: "x" })).toMatchObject({ round: 0 });
  });

  it("omits round when absent", () => {
    expect("round" in stageEvent({ ticketId: "t1", stage: "plan", event: "x" })).toBe(false);
  });

  it("uses the same ticket field names as ticketEvent", () => {
    const stage = stageEvent({ ticketId: "t1", runId: "r1", repo: "acme/x", stage: "plan", event: "e" });
    const ticket = ticketEvent({ ticketId: "t1", runId: "r1", repo: "acme/x", event: "e" });

    // The whole point: a query filtering on ticketId/runId must match both.
    for (const k of Object.keys(ticket)) expect(stage).toHaveProperty(k, ticket[k]);
  });

  it("produces a flat object", () => {
    const e = stageEvent({ ticketId: "t1", stage: "plan", event: "x", verdict: "pass" });

    // Nested objects do not index as separate fields in most log backends.
    for (const v of Object.values(e)) {
      expect(typeof v === "object" && v !== null && !Array.isArray(v)).toBe(false);
    }
  });
});
