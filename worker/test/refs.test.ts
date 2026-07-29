// Context refs: parsing them out of chat, and ranking previously-used ones by
// frecency. Both were untested, and both are best-effort by design — which is
// exactly the shape where a silent failure goes unnoticed.

import { fakeEnv } from "@workhorse/test-utils/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providers = new Map<string, { kind: string; label: string; match: (s: string) => string | null }>([
  ["jira", { kind: "jira", label: "Jira", match: (s) => /^[A-Z]+-\d+$/.exec(s)?.[0] ?? null }],
  [
    "slack",
    {
      kind: "slack",
      label: "Slack",
      // EXTRACTS the URL rather than returning the whole input. A provider that
      // returned its input would produce a different "ref" for the bare token and
      // for the surrounding sentence, and parseRefs — which tries both — would
      // record the same link twice.
      match: (s) => /https:\/\/\S*slack\.com\/archives\/\S+/.exec(s)?.[0] ?? null,
    },
  ],
]);

vi.mock("../src/registry", () => ({ attachmentProviders: () => providers }));

const { parseRefs, rankedRefs, recordRefUse } = await import("../src/refs");

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("parseRefs", () => {
  it("finds a ref among ordinary words", () => {
    expect(parseRefs("please fix PROJ-42 today")).toEqual([
      { kind: "jira", ref: "PROJ-42", label: "Jira", icon: undefined },
    ]);
  });

  it("finds several refs of different kinds", () => {
    const found = parseRefs("PROJ-42 and https://x.slack.com/archives/C1/p2");
    expect(found.map((r) => r.kind).sort()).toEqual(["jira", "slack"]);
  });

  it("deduplicates the same ref mentioned twice", () => {
    expect(parseRefs("PROJ-42 then PROJ-42 again")).toHaveLength(1);
  });

  it("returns nothing for text with no refs", () => {
    expect(parseRefs("just do the thing")).toEqual([]);
  });

  it("matches the WHOLE string too, for URL providers", () => {
    // A URL provider needs the untokenized input; splitting on whitespace alone
    // would miss a ref that IS the message.
    expect(parseRefs("https://x.slack.com/archives/C1/p2")).toHaveLength(1);
  });

  it("survives a provider whose match() throws", () => {
    providers.set("broken", {
      kind: "broken",
      label: "Broken",
      match: () => {
        throw new Error("provider bug");
      },
    });

    // One bad plugin must not make every dispatch fail.
    expect(() => parseRefs("PROJ-42")).not.toThrow();
    expect(parseRefs("PROJ-42").map((r) => r.kind)).toEqual(["jira"]);
    providers.delete("broken");
  });
});

describe("recordRefUse", () => {
  it("stores a first-use counter", async () => {
    const env = fakeEnv();
    await recordRefUse(env, [{ kind: "jira", ref: "PROJ-42", label: "Jira" }]);

    const raw = await env.TICKETS.get("reffrecency:v1");
    expect(JSON.parse(raw as string)["jira:PROJ-42"]).toMatchObject({ count: 1, lastUsed: NOW });
  });

  it("increments an existing counter", async () => {
    const env = fakeEnv();
    await recordRefUse(env, [{ kind: "jira", ref: "PROJ-42", label: "Jira" }]);
    await recordRefUse(env, [{ kind: "jira", ref: "PROJ-42", label: "Jira" }]);

    const raw = await env.TICKETS.get("reffrecency:v1");
    expect(JSON.parse(raw as string)["jira:PROJ-42"].count).toBe(2);
  });

  it("preserves a label a later use omits", async () => {
    const env = fakeEnv();
    await recordRefUse(env, [{ kind: "jira", ref: "PROJ-42", label: "Jira", icon: "j" }]);
    await recordRefUse(env, [{ kind: "jira", ref: "PROJ-42", label: undefined as never }]);

    const stat = JSON.parse((await env.TICKETS.get("reffrecency:v1")) as string)["jira:PROJ-42"];
    expect(stat.label).toBe("Jira");
    expect(stat.icon).toBe("j");
  });

  it("writes nothing for an empty list", async () => {
    const env = fakeEnv();
    await recordRefUse(env, []);

    expect(await env.TICKETS.get("reffrecency:v1")).toBeNull();
  });

  it("never throws when the store fails", async () => {
    const env = fakeEnv();
    env.TICKETS.put = async () => {
      throw new Error("KV down");
    };

    // Frecency is a nicety for the composer's chips. It must never block a
    // dispatch.
    await expect(recordRefUse(env, [{ kind: "jira", ref: "P-1", label: "J" }])).resolves.toBeUndefined();
  });
});

describe("rankedRefs", () => {
  it("returns nothing when nothing was ever recorded", async () => {
    expect(await rankedRefs(fakeEnv())).toEqual([]);
  });

  it("ranks a more-used ref above a less-used one", async () => {
    const env = fakeEnv();
    await recordRefUse(env, [{ kind: "jira", ref: "OFTEN", label: "J" }]);
    await recordRefUse(env, [{ kind: "jira", ref: "OFTEN", label: "J" }]);
    await recordRefUse(env, [{ kind: "jira", ref: "ONCE", label: "J" }]);

    expect((await rankedRefs(env)).map((r) => r.ref)).toEqual(["OFTEN", "ONCE"]);
  });

  it("decays an old ref below a recent one despite more uses", async () => {
    const env = fakeEnv();

    // Three uses, 60 days ago — past four half-lives, so ~3 × 0.0625.
    await recordRefUse(env, [{ kind: "jira", ref: "OLD", label: "J" }]);
    await recordRefUse(env, [{ kind: "jira", ref: "OLD", label: "J" }]);
    await recordRefUse(env, [{ kind: "jira", ref: "OLD", label: "J" }]);

    vi.setSystemTime(NOW + 60 * 24 * 3600_000);
    await recordRefUse(env, [{ kind: "jira", ref: "NEW", label: "J" }]);

    // Recency is the point: a ref from two months ago is probably not what the
    // operator is about to reference again.
    expect((await rankedRefs(env)).map((r) => r.ref)).toEqual(["NEW", "OLD"]);
  });

  it("honours the limit", async () => {
    const env = fakeEnv();
    for (let i = 0; i < 5; i++) await recordRefUse(env, [{ kind: "jira", ref: `R-${i}`, label: "J" }]);

    expect(await rankedRefs(env, 2)).toHaveLength(2);
  });

  it("falls back to the ref as its own label", async () => {
    const env = fakeEnv();
    await env.TICKETS.put(
      "reffrecency:v1",
      JSON.stringify({ "jira:P-1": { kind: "jira", ref: "P-1", count: 1, lastUsed: NOW } }),
    );

    expect((await rankedRefs(env))[0].label).toBe("P-1");
  });

  it("returns empty on corrupt stored data instead of throwing", async () => {
    const env = fakeEnv();
    await env.TICKETS.put("reffrecency:v1", "{not json");

    expect(await rankedRefs(env)).toEqual([]);
  });
});
