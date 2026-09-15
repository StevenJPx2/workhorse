// Re-indexing every archived trace into fleet knowledge.
//
// Was an inline route closure and therefore untestable. It paginates two stores,
// de-duplicates across them, and must survive a corrupt trace — a backfill that
// aborts halfway through thousands of runs, reporting success, is the failure that
// would go unnoticed.

import { fakeAiSearch, fakeCore } from "@workhorse/test-utils/tools";
import { describe, expect, it } from "vitest";
import { reindexAll } from "../plugin";

const trace = (ticketId: string, runId: string) =>
  JSON.stringify({ ticketId, runId, kind: "run", activity: { status: "done", tasks: [] } });

interface StoreOptions {
  /** R2 pages, in order. Several entries exercise the cursor loop. */
  r2?: string[][];
  /** KV pages, in order. */
  kv?: string[][];
}

/** An Env with paginated R2 + KV trace stores and a working AI Search. */
function storeEnv(options: StoreOptions = {}) {
  const r2Pages = options.r2 ?? [];
  const kvPages = options.kv ?? [];
  const bodies = new Map<string, string>();

  r2Pages.flat().forEach((body, i) => bodies.set(`trace/r2-${i}.json`, body));
  const kvEntries = kvPages.flat().map((body, i) => [`trace:kv-${i}`, body] as const);

  let r2Index = 0;
  let kvIndex = 0;

  return {
    AI_SEARCH: fakeAiSearch(),
    BLOBS: {
      async list() {
        const page = r2Pages[r2Index] ?? [];
        const offset = r2Pages.slice(0, r2Index).flat().length;
        const objects = page.map((_, i) => ({ key: `trace/r2-${offset + i}.json` }));
        r2Index++;
        return { objects, truncated: r2Index < r2Pages.length, cursor: `r2-${r2Index}` };
      },
      async get(key: string) {
        const body = bodies.get(key);
        return body ? { text: async () => body } : null;
      },
    },
    TICKETS: {
      async list() {
        const page = kvPages[kvIndex] ?? [];
        const offset = kvPages.slice(0, kvIndex).flat().length;
        const keys = page.map((_, i) => ({ name: `trace:kv-${offset + i}` }));
        kvIndex++;
        return { keys, list_complete: kvIndex >= kvPages.length, cursor: `kv-${kvIndex}` };
      },
      async get(name: string) {
        return kvEntries.find(([k]) => k === name)?.[1] ?? null;
      },
    },
  } as never;
}

const core = () => fakeCore({ getTicket: async () => ({ title: "t", repo: "acme/widgets" }) as never });

describe("reindexAll", () => {
  it("indexes nothing when both stores are empty", async () => {
    expect(await reindexAll(storeEnv(), core())).toEqual({ indexed: 0, failed: 0 });
  });

  it("indexes R2 traces", async () => {
    const r = await reindexAll(storeEnv({ r2: [[trace("t1", "r1"), trace("t2", "r1")]] }), core());

    expect(r).toEqual({ indexed: 2, failed: 0 });
  });

  it("indexes legacy KV traces too", async () => {
    const r = await reindexAll(storeEnv({ kv: [[trace("t9", "r1")]] }), core());

    // Pre-blob-plane runs are still real history.
    expect(r).toEqual({ indexed: 1, failed: 0 });
  });

  it("follows the R2 cursor across pages", async () => {
    const r = await reindexAll(
      storeEnv({ r2: [[trace("t1", "r1")], [trace("t2", "r1")], [trace("t3", "r1")]] }),
      core(),
    );

    // Stopping at page one would silently index a fraction and report success.
    expect(r.indexed).toBe(3);
  });

  it("follows the KV cursor across pages", async () => {
    const r = await reindexAll(storeEnv({ kv: [[trace("t1", "r1")], [trace("t2", "r1")]] }), core());

    expect(r.indexed).toBe(2);
  });

  it("de-duplicates a trace present in BOTH stores", async () => {
    const same = trace("t1", "r1");
    const r = await reindexAll(storeEnv({ r2: [[same]], kv: [[same]] }), core());

    // Runs that straddled the migration exist twice; counting both would
    // misreport the backfill.
    expect(r).toEqual({ indexed: 1, failed: 0 });
  });

  it("counts a corrupt trace as failed and KEEPS GOING", async () => {
    const r = await reindexAll(storeEnv({ r2: [["{not json"], [trace("t2", "r1")]] }), core());

    expect(r).toEqual({ indexed: 1, failed: 1 });
  });

  it("counts a trace as failed when indexing it fails", async () => {
    const env = storeEnv({ r2: [[trace("t1", "r1")]] });
    (env as { AI_SEARCH: unknown }).AI_SEARCH = fakeAiSearch({ missing: true, createFails: true });

    expect(await reindexAll(env, core())).toEqual({ indexed: 0, failed: 1 });
  });

  it("indexes a trace whose ticket no longer exists", async () => {
    const r = await reindexAll(
      storeEnv({ r2: [[trace("gone", "r1")]] }),
      fakeCore({ getTicket: async () => null }),
    );

    // A deleted ticket's run is still knowledge worth keeping.
    expect(r).toEqual({ indexed: 1, failed: 0 });
  });

  it("skips an R2 object whose body cannot be read", async () => {
    const env = storeEnv({ r2: [[trace("t1", "r1")]] });
    (env as { BLOBS: { get: unknown } }).BLOBS.get = async () => null;

    expect(await reindexAll(env, core())).toEqual({ indexed: 0, failed: 0 });
  });
});
