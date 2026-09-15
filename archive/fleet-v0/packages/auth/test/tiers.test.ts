// Auth tiers. These are the checks standing between a public URL and the fleet,
// so the cases below are adversarial rather than illustrative.

import { describe, expect, it } from "vitest";
import { bearer, permits, resolveTiers } from "../src/tiers";

const tokens = { master: "master-key-aaaa", scoped: "scoped-key-bbbb" };

describe("bearer", () => {
  it("extracts the token", () => {
    expect(bearer("Bearer abc123")).toBe("abc123");
  });

  it("accepts a lowercase scheme", () => {
    // RFC 7235 says the scheme is case-insensitive, and real senders vary.
    expect(bearer("bearer abc123")).toBe("abc123");
  });

  it("tolerates extra whitespace", () => {
    expect(bearer("  Bearer   abc123  ")).toBe("abc123");
  });

  it.each<[string | null | undefined, string]>([
    [null, "null"],
    [undefined, "undefined"],
    ["", "empty"],
    ["abc123", "no scheme"],
    ["Basic abc123", "wrong scheme"],
    ["Bearer", "scheme only"],
    ["Bearer ", "empty token"],
  ])("returns empty for %s (%s)", (header) => {
    expect(bearer(header)).toBe("");
  });
});

describe("resolveTiers", () => {
  it("grants master for the master token", () => {
    expect(resolveTiers("Bearer master-key-aaaa", tokens)).toEqual({ scoped: true, master: true });
  });

  it("grants scoped for the scoped token, but not master", () => {
    expect(resolveTiers("Bearer scoped-key-bbbb", tokens)).toEqual({ scoped: true, master: false });
  });

  it("grants nothing for a wrong token", () => {
    expect(resolveTiers("Bearer nope", tokens)).toEqual({ scoped: false, master: false });
  });

  it("grants nothing for a missing header", () => {
    expect(resolveTiers(null, tokens)).toEqual({ scoped: false, master: false });
  });

  it("makes master imply scoped", () => {
    // An operator holding the master key can do anything a sandbox can; a
    // separate check would be a lie about the trust hierarchy.
    expect(resolveTiers("Bearer master-key-aaaa", tokens).scoped).toBe(true);
  });

  it("has no scoped tier when no scoped token is configured", () => {
    expect(resolveTiers("Bearer anything", { master: "master-key-aaaa" })).toEqual({
      scoped: false,
      master: false,
    });
  });

  it("does NOT authenticate an empty header against an empty master token", () => {
    // The dangerous case: an unset SPIKE_TOKEN plus a request with no auth would
    // compare "" === "" and hand out master. This is why the check requires both
    // sides to be non-empty.
    expect(resolveTiers(null, { master: "" })).toEqual({ scoped: false, master: false });
    expect(resolveTiers("Bearer ", { master: "" })).toEqual({ scoped: false, master: false });
  });

  it("does NOT authenticate an empty scoped token", () => {
    expect(resolveTiers("Bearer ", { master: "m", scoped: "" })).toEqual({ scoped: false, master: false });
  });

  it("rejects a token that is a prefix of the real one", () => {
    expect(resolveTiers("Bearer master-key-aaa", tokens).master).toBe(false);
  });

  it("rejects a token with the real one as a prefix", () => {
    expect(resolveTiers("Bearer master-key-aaaaa", tokens).master).toBe(false);
  });

  it("is case-sensitive on the token itself", () => {
    expect(resolveTiers("Bearer MASTER-KEY-AAAA", tokens).master).toBe(false);
  });
});

describe("permits", () => {
  const none = { scoped: false, master: false };
  const scopedOnly = { scoped: true, master: false };
  const full = { scoped: true, master: true };

  it("lets anyone into a public route", () => {
    expect(permits("public", none)).toBe(true);
  });

  it("requires scoped for a scoped route", () => {
    expect(permits("scoped", none)).toBe(false);
    expect(permits("scoped", scopedOnly)).toBe(true);
  });

  it("requires master for a master route", () => {
    // The critical one: a leaked sandbox token must not command the fleet.
    expect(permits("master", scopedOnly)).toBe(false);
    expect(permits("master", full)).toBe(true);
  });
});
