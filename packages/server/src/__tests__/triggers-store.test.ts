// Trigger validation, storage, and the cron sweep.
//
// The existing triggers suite covers the pure helpers (cronMatches,
// renderTemplate). This covers the stateful half — validation, the KV store, and
// the sweep that actually fires them — which the extraction exposed at 0%
// coverage.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteTrigger,
  fireTrigger,
  getTrigger,
  listTriggers,
  putTrigger,
  sweepCronTriggers,
  validateTrigger,
} from "../triggers";

const fileTicket = vi.fn(async (_env: unknown, _body: Record<string, unknown>) => ({
  ok: true,
  ticket: { id: "t1" },
}));
const intake = { fileTicket } as never;

const trigger = (over: Record<string, unknown> = {}) => ({
  name: "nightly",
  source: "cron",
  schedule: "0 3 * * *",
  template: "run the nightly checks",
  repo: "acme/widgets",
  enabled: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fileTicket.mockResolvedValue({ ok: true, ticket: { id: "t1" } });
});

describe("validateTrigger", () => {
  it("accepts a complete cron trigger", () => {
    expect(validateTrigger(trigger() as never)).toBeNull();
  });

  it("accepts a webhook trigger with no schedule", () => {
    expect(validateTrigger(trigger({ source: "webhook", schedule: undefined }) as never)).toBeNull();
  });

  it("rejects a bad name", () => {
    for (const name of ["", "Has Spaces", "UPPER"]) {
      expect(validateTrigger(trigger({ name }) as never)).toContain("name");
    }
  });

  it("requires a source and a template", () => {
    expect(validateTrigger(trigger({ source: "" }) as never)).toContain("source");
    expect(validateTrigger(trigger({ template: "  " }) as never)).toContain("template");
  });

  it("requires a schedule for a CRON trigger", () => {
    // A cron trigger with no schedule would sit in the registry never firing,
    // which reads as a broken feature rather than a config error.
    expect(validateTrigger(trigger({ schedule: undefined }) as never)).toContain("schedule");
  });

  it("rejects an invalid cron expression", () => {
    expect(validateTrigger(trigger({ schedule: "* * *" }) as never)).toContain("5 fields");
    expect(validateTrigger(trigger({ schedule: "99 * * * *" }) as never)).toContain("out of range");
  });

  it("requires a repo, directly or as an attachment", () => {
    expect(validateTrigger(trigger({ repo: undefined }) as never)).toContain("repo");

    // A repo attachment satisfies it — the ticket can still be cloned.
    expect(
      validateTrigger(trigger({ repo: undefined, attachments: [{ kind: "repo", ref: "acme/x" }] }) as never),
    ).toBeNull();
  });
});

describe("the store", () => {
  it("round-trips a trigger", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);

    expect(await getTrigger(env, "nightly")).toMatchObject({ name: "nightly", schedule: "0 3 * * *" });
  });

  it("returns null for an unknown trigger", async () => {
    expect(await getTrigger(fakeEnv(), "nope")).toBeNull();
  });

  it("lists what is stored", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);
    await putTrigger(env, trigger({ name: "weekly" }) as never);

    expect((await listTriggers(env)).map((t) => t.name).sort()).toEqual(["nightly", "weekly"]);
  });

  it("lists nothing when none are stored", async () => {
    expect(await listTriggers(fakeEnv())).toEqual([]);
  });

  it("deletes", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);
    await deleteTrigger(env, "nightly");

    expect(await getTrigger(env, "nightly")).toBeNull();
  });

  it("overwrites on re-put", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);
    await putTrigger(env, trigger({ template: "changed" }) as never);

    expect((await listTriggers(env))).toHaveLength(1);
    expect(await getTrigger(env, "nightly")).toMatchObject({ template: "changed" });
  });
});

describe("fireTrigger", () => {
  it("files a ticket from the rendered template", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ template: "check {{what}}" }) as never);

    const r = await fireTrigger(intake, env, "nightly", { what: "the build" });

    expect(r.ok).toBe(true);
    expect(fileTicket.mock.calls[0][1]).toMatchObject({ prompt: "check the build", repo: "acme/widgets" });
  });

  it("404s an unknown trigger", async () => {
    expect(await fireTrigger(intake, fakeEnv(), "nope", {})).toMatchObject({ ok: false, status: 404 });
  });

  it("409s a DISABLED trigger", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ enabled: false }) as never);

    // Disabled must mean disabled even when something else invokes it directly.
    expect(await fireTrigger(intake, env, "nightly", {})).toMatchObject({ ok: false, status: 409 });
    expect(fileTicket).not.toHaveBeenCalled();
  });

  it("422s when the template renders empty", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ template: "{{missing}}" }) as never);

    // Filing a ticket with an empty prompt would spend a whole run on nothing.
    expect(await fireTrigger(intake, env, "nightly", {})).toMatchObject({ ok: false, status: 422 });
    expect(fileTicket).not.toHaveBeenCalled();
  });

  it("stamps lastFiredAt on success", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);
    await fireTrigger(intake, env, "nightly", {});

    expect(await getTrigger(env, "nightly")).toMatchObject({ lastFiredAt: expect.any(String) });
  });

  it("does NOT stamp lastFiredAt when filing failed", async () => {
    fileTicket.mockResolvedValue({ ok: false, error: "no token", status: 503 } as never);
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);

    await fireTrigger(intake, env, "nightly", {});

    // Stamping a failed fire would make the sweep's dedupe skip the retry.
    expect(await getTrigger(env, "nightly")).not.toHaveProperty("lastFiredAt");
  });

  it("titles the ticket with the trigger name", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);
    await fireTrigger(intake, env, "nightly", {});

    expect(String(fileTicket.mock.calls[0][1].title)).toContain("[nightly]");
  });
});

describe("sweepCronTriggers", () => {
  const AT_3AM = new Date("2026-07-29T03:00:00Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT_3AM);
  });

  it("fires a matching cron trigger", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger() as never);

    expect(await sweepCronTriggers(intake, env)).toEqual(["nightly:t1"]);
  });

  it("skips a trigger whose schedule does not match", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ schedule: "0 9 * * *" }) as never);

    expect(await sweepCronTriggers(intake, env)).toEqual([]);
  });

  it("skips a disabled trigger", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ enabled: false }) as never);

    expect(await sweepCronTriggers(intake, env)).toEqual([]);
  });

  it("skips a NON-cron trigger even if its schedule would match", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ source: "webhook" }) as never);

    // A webhook trigger fires on its webhook, not on the clock.
    expect(await sweepCronTriggers(intake, env)).toEqual([]);
  });

  it("does not re-fire a minute it ALREADY fired", async () => {
    const env = fakeEnv();
    // Exactly the matching minute: the sweep runs every 15 min over a 16-min
    // window, so consecutive sweeps overlap and would double-file without this.
    await putTrigger(env, trigger({ lastFiredAt: new Date(AT_3AM).toISOString() }) as never);

    expect(await sweepCronTriggers(intake, env)).toEqual([]);
  });

  it("DOES fire a match that is newer than the last firing", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ lastFiredAt: new Date(AT_3AM - 60_000).toISOString() }) as never);

    // The dedupe is per-minute, not a cooldown: 03:00 is a genuine new match even
    // though the trigger fired a minute earlier.
    expect(await sweepCronTriggers(intake, env)).toEqual(["nightly:t1"]);
  });

  it("fires again once the window has passed", async () => {
    const env = fakeEnv();
    await putTrigger(env, trigger({ lastFiredAt: new Date(AT_3AM - 24 * 3600_000).toISOString() }) as never);

    expect(await sweepCronTriggers(intake, env)).toEqual(["nightly:t1"]);
  });
});
