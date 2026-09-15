import { fakeCore, fakeEnv } from "@workhorse/test-utils/tools";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { sourcefedPlugin } from "../plugin";

const SECRET = "test-secret";

const { appendEvents, wakeTicket } = vi.hoisted(() => ({
  appendEvents: vi.fn(async () => {}),
  wakeTicket: vi.fn(async () => {}),
}));
vi.mock("@workhorse/events", () => ({ appendEvents, wakeTicket }));

function env() {
  return { ...fakeEnv(), SOURCEFED_WEBHOOK_SECRET: SECRET };
}

function request(secret: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("x-sourcefed-secret", secret);
  return new Request("https://w.dev/webhooks/sourcefed", { method: "POST", headers, body: "{}" });
}

/** ctx whose waitUntil runs the deferred work so tests can await it. */
function drainingCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) } as unknown as ExecutionContext,
    drain: () => Promise.allSettled(pending),
  };
}

describe("sourcefed webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing or wrong secret", async () => {
    const v = sourcefedPlugin.webhook!;
    expect(await v.verify(request(null), "", env())).toBe(false);
    expect(await v.verify(request("nope"), "", env())).toBe(false);
    expect(await v.verify(request(SECRET), "", env())).toBe(true);
  });

  it("rejects when the secret is not configured", async () => {
    const v = sourcefedPlugin.webhook!;
    expect(await v.verify(request(SECRET), "", fakeEnv())).toBe(false);
  });

  it("acks immediately and appends ticket frames + wakes the ticket", async () => {
    const core = fakeCore() as ReturnType<typeof fakeCore>;
    const { ctx, drain } = drainingCtx();
    const res = await sourcefedPlugin.webhook!.handle!(
      request(SECRET),
      { ticketId: "t1", kind: "pr-review", summary: "reviewer requested changes", actor: "steven" },
      env(),
      ctx,
      core,
    );

    // Fast ack first — the daemon must not wait on durable work.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: 1 });

    await drain();
    expect(appendEvents).toHaveBeenCalledTimes(1);
    const ev = appendEvents.mock.calls[0][1][0];
    expect(ev).toMatchObject({ ticketId: "t1", kind: "pr-review", summary: "reviewer requested changes", actor: "steven" });
    expect(wakeTicket).toHaveBeenCalledWith(expect.objectContaining({ SOURCEFED_WEBHOOK_SECRET: SECRET }), "t1");
  });

  it("fires monitor frames through core.fireTrigger", async () => {
    const fireTrigger = vi.fn(async () => ({ ok: true, ticket: { id: "t9" } }));
    const core = { fireTrigger } as unknown as ReturnType<typeof fakeCore>;
    const { ctx, drain } = drainingCtx();

    await sourcefedPlugin.webhook!.handle!(
      request(SECRET),
      { kind: "monitor", summary: "monitor fired", monitor: { name: "gh-pr-watch", payload: { repo: "a/b" } } },
      env(),
      ctx,
      core,
    );
    await drain();

    expect(fireTrigger).toHaveBeenCalledWith("gh-pr-watch", { repo: "a/b" });
  });

  it("skips a redelivered frame by deliveryId", async () => {
    const fireTrigger = vi.fn(async () => ({ ok: true, ticket: { id: "t9" } }));
    const core = { fireTrigger } as unknown as ReturnType<typeof fakeCore>;
    const { ctx, drain } = drainingCtx();
    const e = env();

    const frame = { kind: "monitor", summary: "m", monitor: { name: "x", payload: {} }, deliveryId: "d1" };
    await sourcefedPlugin.webhook!.handle!(request(SECRET), frame, e, ctx, core);
    await drain();
    await sourcefedPlugin.webhook!.handle!(request(SECRET), frame, e, ctx, core);
    await drain();

    expect(fireTrigger).toHaveBeenCalledTimes(1);
  });

  it("handles an array of frames", async () => {
    const fireTrigger = vi.fn(async () => ({ ok: false, error: "no trigger" }));
    const core = { fireTrigger } as unknown as ReturnType<typeof fakeCore>;
    const { ctx, drain } = drainingCtx();

    const res = await sourcefedPlugin.webhook!.handle!(
      request(SECRET),
      [
        { kind: "monitor", summary: "m", monitor: { name: "x", payload: {} } },
        { kind: "monitor", summary: "m2", monitor: { name: "y", payload: {} } },
      ],
      env(),
      ctx,
      core,
    );
    expect((await res.json()).accepted).toBe(2);
    await drain();
    expect(fireTrigger).toHaveBeenCalledTimes(2);
  });
});
