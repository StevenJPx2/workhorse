// Model-credential custody. The runway logic here decides whether a run starts
// at all, and the zero-expiry case is the one that would ground the fleet if it
// were treated as "expired".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelTokenStore, START_RUNWAY_MS, STAGE_RUNWAY_MS, type TokenStore } from "../src/model-token";

const NOW = 1_800_000_000_000;
const VALID = "sk-ant-oat01-abcdef";

/** In-memory KV. Records writes so a rejected push can be shown not to have landed. */
function fakeKv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<{ key: string; value: string }> = [];

  const store: TokenStore & { writes: typeof writes; data: typeof data } = {
    get: async (key) => data.get(key) ?? null,
    put: async (key, value) => {
      writes.push({ key, value });
      data.set(key, value);
    },
    writes,
    data,
  };
  return store;
}

const stored = (over: { access?: string; expires?: number } = {}) =>
  JSON.stringify({ access: VALID, expires: NOW + 60 * 60 * 1000, ...over });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("read", () => {
  it("returns the stored record", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored() }));
    expect((await s.read())?.access).toBe(VALID);
  });

  it("returns null when absent", async () => {
    expect(await new ModelTokenStore(fakeKv()).read()).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", async () => {
    // A bad KV write must not crash every run — for callers this is
    // indistinguishable from absent.
    const s = new ModelTokenStore(fakeKv({ "auth:access": "{not json" }));
    expect(await s.read()).toBeNull();
  });

  it("returns null for JSON with no access field", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": JSON.stringify({ expires: NOW }) }));
    expect(await s.read()).toBeNull();
  });
});

describe("write", () => {
  it("stores a valid OAuth access token", async () => {
    const kv = fakeKv();
    const r = await new ModelTokenStore(kv).write({ access: VALID, expires: NOW });

    expect(r.ok).toBe(true);
    expect(kv.writes).toHaveLength(1);
    expect(kv.writes[0].key).toBe("auth:access");
  });

  it.each([
    ["sk-ant-api03-xxx", "an API key"],
    ["sk-ant-ort01-xxx", "a refresh token"],
    ["", "empty"],
    ["Bearer sk-ant-oat01-xxx", "a prefixed header value"],
  ])("rejects %s (%s) without writing", async (access) => {
    const kv = fakeKv();
    const r = await new ModelTokenStore(kv).write({ access, expires: NOW });

    expect(r.ok).toBe(false);
    // The important half: a mistakenly-pushed long-lived credential does not
    // land in KV, where sandboxes would then receive it.
    expect(kv.writes).toHaveLength(0);
  });

  it("persists only access and expires", async () => {
    const kv = fakeKv();
    await new ModelTokenStore(kv).write({ access: VALID, expires: NOW, refresh: "secret" } as never);

    expect(JSON.parse(kv.writes[0].value)).toEqual({ access: VALID, expires: NOW });
  });
});

describe("usable", () => {
  it("returns the token with ample runway", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored() }));
    expect(await s.usable()).toBe(VALID);
  });

  it("returns null when absent", async () => {
    expect(await new ModelTokenStore(fakeKv()).usable()).toBeNull();
  });

  it("returns null when already expired", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW - 1000 }) }));
    expect(await s.usable()).toBeNull();
  });

  it("returns null just inside the runway", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW + START_RUNWAY_MS - 1 }) }));
    expect(await s.usable(START_RUNWAY_MS)).toBeNull();
  });

  it("returns the token exactly at the runway boundary", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW + START_RUNWAY_MS }) }));
    expect(await s.usable(START_RUNWAY_MS)).toBe(VALID);
  });

  it("treats a ZERO expiry as usable", async () => {
    // The custodian sometimes pushes without runway info. Refusing here would
    // ground the whole fleet over missing metadata rather than a missing token.
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: 0 }) }));
    expect(await s.usable()).toBe(VALID);
  });

  it("accepts a token for a STAGE that would be refused for a new run", async () => {
    // 7 minutes left: too little to begin a run, enough for the next stage of one
    // already in flight.
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW + 7 * 60_000 }) }));

    expect(await s.usable(START_RUNWAY_MS)).toBeNull();
    expect(await s.usable(STAGE_RUNWAY_MS)).toBe(VALID);
  });
});

describe("health", () => {
  it("reports missing with no token", async () => {
    expect(await new ModelTokenStore(fakeKv()).health()).toEqual({
      present: false,
      state: "missing",
      minutesRemaining: null,
      expires: null,
    });
  });

  it("reports fresh with ample runway", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW + 3 * 60 * 60_000 }) }));
    const h = await s.health();

    expect(h.state).toBe("fresh");
    expect(h.minutesRemaining).toBe(180);
  });

  it("reports expiring inside the start runway", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW + 5 * 60_000 }) }));
    expect((await s.health()).state).toBe("expiring");
  });

  it("reports expired past the deadline", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: NOW - 60_000 }) }));
    const h = await s.health();

    expect(h.state).toBe("expired");
    expect(h.minutesRemaining).toBe(-1);
  });

  it("reports unknown for a zero expiry", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored({ expires: 0 }) }));
    const h = await s.health();

    expect(h.state).toBe("unknown");
    expect(h.minutesRemaining).toBeNull();
  });

  it("never returns the token itself", async () => {
    const s = new ModelTokenStore(fakeKv({ "auth:access": stored() }));
    const h = await s.health();

    // This feeds an operator UI tile. Leaking the credential into a dashboard
    // response would defeat keeping it worker-side.
    expect(JSON.stringify(h)).not.toContain(VALID);
    expect(JSON.stringify(h)).not.toContain("sk-ant");
  });
});
