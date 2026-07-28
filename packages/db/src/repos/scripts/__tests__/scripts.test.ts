// Script storage. The interesting behaviour is the JSON columns (which the old
// layer parsed by hand) and scope shadowing.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db";
import type { Script } from "../../../schema";

const script = (over: Partial<Script> = {}): Script => ({
  scope: "global",
  name: "run_tests",
  description: "run the suite",
  code: "return await tools.bash({ cmd: 'bun test' });",
  args: [],
  statusGates: [],
  createdBy: "agent",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...over,
});

let db: Db;

beforeEach(async () => {
  db = createDb(env.DB);
});

describe("json columns", () => {
  it("round-trips args as structured objects, not strings", async () => {
    const args = [
      { name: "target", description: "what to test", required: true },
      { name: "verbose" },
    ];
    await db.scripts.upsert(script({ args }));

    const got = await db.scripts.get("global", "run_tests");
    // The old layer returned JSON.parse(...) typed as any; a caller reading
    // .args[0].name got no type checking and a string here would not have failed.
    expect(got?.args).toEqual(args);
    expect(Array.isArray(got?.args)).toBe(true);
    expect(got?.args[0]?.required).toBe(true);
  });

  it("round-trips statusGates", async () => {
    await db.scripts.upsert(script({ statusGates: ["planning", "implementing"] }));
    expect((await db.scripts.get("global", "run_tests"))?.statusGates).toEqual(["planning", "implementing"]);
  });

  it("defaults both JSON columns to empty arrays", async () => {
    await db.scripts.upsert(script());
    const got = await db.scripts.get("global", "run_tests");

    expect(got?.args).toEqual([]);
    expect(got?.statusGates).toEqual([]);
  });
});

describe("upsert", () => {
  it("replaces code and description on conflict", async () => {
    await db.scripts.upsert(script({ description: "v1", code: "return 1;" }));
    await db.scripts.upsert(script({ description: "v2", code: "return 2;", updatedAt: "2026-07-02T00:00:00.000Z" }));

    const got = await db.scripts.get("global", "run_tests");
    expect(got?.description).toBe("v2");
    expect(got?.code).toBe("return 2;");
    expect(got?.updatedAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("preserves createdAt and createdBy across a rewrite", async () => {
    await db.scripts.upsert(script({ createdBy: "seed", createdAt: "2026-01-01T00:00:00.000Z" }));
    await db.scripts.upsert(script({ createdBy: "agent", createdAt: "2026-09-09T00:00:00.000Z" }));

    const got = await db.scripts.get("global", "run_tests");
    // Provenance survives: who first created it, and when, is not rewritable by
    // a later upsert.
    expect(got?.createdBy).toBe("seed");
    expect(got?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("treats (scope, name) as the identity — same name in two scopes coexists", async () => {
    await db.scripts.upsert(script({ scope: "global" }));
    await db.scripts.upsert(script({ scope: "repo:acme/widgets" }));

    expect(await db.scripts.get("global", "run_tests")).not.toBeNull();
    expect(await db.scripts.get("repo:acme/widgets", "run_tests")).not.toBeNull();
    expect(await db.scripts.all()).toHaveLength(2);
  });
});

describe("listScripts", () => {
  it("returns only global when no repo is given", async () => {
    await db.scripts.upsert(script({ scope: "global", name: "a" }));
    await db.scripts.upsert(script({ scope: "repo:acme/widgets", name: "b" }));

    expect((await db.scripts.list()).map((s) => s.name)).toEqual(["a"]);
  });

  it("merges repo scope with global", async () => {
    await db.scripts.upsert(script({ scope: "global", name: "shared" }));
    await db.scripts.upsert(script({ scope: "repo:acme/widgets", name: "local" }));

    expect((await db.scripts.list("acme/widgets")).map((s) => s.name).sort()).toEqual(["local", "shared"]);
  });

  it("lets the repo-scoped script shadow a global of the same name", async () => {
    await db.scripts.upsert(script({ scope: "global", name: "deploy", code: "GLOBAL" }));
    await db.scripts.upsert(script({ scope: "repo:acme/widgets", name: "deploy", code: "REPO" }));

    const found = await db.scripts.list("acme/widgets");
    expect(found).toHaveLength(1);
    expect(found[0].code).toBe("REPO");
  });

  it("ignores another repo's scripts", async () => {
    await db.scripts.upsert(script({ scope: "repo:other/thing", name: "secret" }));
    expect(await db.scripts.list("acme/widgets")).toEqual([]);
  });
});

describe("allScripts", () => {
  it("returns every scope, unlike the scoped list", async () => {
    await db.scripts.upsert(script({ scope: "global", name: "a" }));
    await db.scripts.upsert(script({ scope: "repo:x/y", name: "b" }));
    await db.scripts.upsert(script({ scope: "repo:p/q", name: "c" }));

    // This is what the semantic index builds from — a scoped read would index
    // only the scripts one repo can see.
    expect(await db.scripts.all()).toHaveLength(3);
  });
});

describe("deleteScript", () => {
  it("reports true when a row was removed", async () => {
    await db.scripts.upsert(script());
    expect(await db.scripts.remove("global", "run_tests")).toBe(true);
    expect(await db.scripts.get("global", "run_tests")).toBeNull();
  });

  it("reports false when nothing matched", async () => {
    expect(await db.scripts.remove("global", "ghost")).toBe(false);
  });

  it("deletes only the named scope", async () => {
    await db.scripts.upsert(script({ scope: "global" }));
    await db.scripts.upsert(script({ scope: "repo:acme/widgets" }));

    await db.scripts.remove("global", "run_tests");
    expect(await db.scripts.get("repo:acme/widgets", "run_tests")).not.toBeNull();
  });
});
