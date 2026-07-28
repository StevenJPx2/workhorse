// Fake Env — the Cloudflare bindings double.
//
// Env is a wide binding surface (KV, D1, R2, AI, Vectorize, Workflows, Worker
// Loader, secrets), but any one tool touches a sliver of it. Rather than stub
// all of it, this builds an Env whose bindings THROW a named error when
// touched — so a test that forgot to provide a binding gets
// "fakeEnv: TICKETS.get was not stubbed" instead of a bare undefined crash.
// Pass `kv` / `secrets` / arbitrary overrides for the parts under test.

import type { Env } from "@workhorse/api";

/** In-memory KV double covering the get/put/list/delete surface tools use. */
export interface FakeKV {
  get(key: string, type?: unknown): Promise<string | null>;
  put(key: string, value: string, opts?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }>;
  readonly store: Map<string, string>;
}

export function fakeKV(seed: Record<string, string> = {}): FakeKV {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list(opts) {
      const prefix = opts?.prefix ?? "";
      return {
        keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      };
    },
  };
}

/** One AI Search result chunk, in the shape the API actually returns. */
export interface FakeSearchChunk {
  filename?: string;
  score?: number;
  /** Chunk text arrives as an array of parts, not a bare string. */
  content?: Array<{ text?: string }>;
  attributes?: { file?: Record<string, unknown> };
}

export interface FakeAiSearchOptions {
  /** Chunks returned by search(). */
  results?: FakeSearchChunk[];
  /**
   * Make info() reject, so the code under test takes the create-on-first-use
   * path. This is how the real binding signals "instance doesn't exist yet".
   */
  missing?: boolean;
  /** Make create() reject too — the "index unavailable" path. */
  createFails?: boolean;
  /** Make search() reject — the "index broken mid-query" path. */
  searchThrows?: boolean;
}

export interface FakeAiSearch {
  get(id: string): unknown;
  create(spec: unknown): Promise<unknown>;
  /** Every search() query, in order. */
  readonly queries: Array<{ query: string; options?: unknown }>;
  /** Instance ids passed to get(). */
  readonly gets: string[];
  /** Specs passed to create(). */
  readonly creates: unknown[];
}

/**
 * In-memory AI Search double (the AI_SEARCH binding backing fleet knowledge).
 *
 * Models the real two-step shape: `get(id)` hands back an instance whose
 * `info()` decides whether it already exists, and `create()` provisions it.
 */
export function fakeAiSearch(options: FakeAiSearchOptions = {}): FakeAiSearch {
  const queries: Array<{ query: string; options?: unknown }> = [];
  const gets: string[] = [];
  const creates: unknown[] = [];

  const makeInstance = () => ({
    async info() {
      if (options.missing) throw new Error("instance not found");
      return { id: "fake" };
    },
    async search(args: { query: string; ai_search_options?: unknown }) {
      queries.push({ query: args.query, options: args.ai_search_options });
      if (options.searchThrows) throw new Error("search backend unavailable");
      return { data: options.results ?? [] };
    },
  });

  return {
    queries,
    gets,
    creates,
    get(id: string) {
      gets.push(id);
      return makeInstance();
    },
    async create(spec: unknown) {
      creates.push(spec);
      if (options.createFails) throw new Error("create failed");
      return makeInstance();
    },
  };
}

/** A binding that reports which member was touched instead of crashing opaquely. */
function unstubbed(binding: string): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return undefined; // don't look thenable to await
        return () => {
          throw new Error(
            `fakeEnv: ${binding}.${String(prop)} was not stubbed — pass it to fakeEnv({ ${binding}: ... })`,
          );
        };
      },
    },
  );
}

export interface FakeEnvOptions {
  /** Seed the TICKETS KV namespace. */
  kv?: Record<string, string>;
  /** Override any binding or secret directly. */
  [binding: string]: unknown;
}

/**
 * Build a fake Env. Secrets default to recognizable test values; bindings
 * default to throw-on-touch proxies naming the missing stub.
 */
export function fakeEnv(options: FakeEnvOptions = {}): Env {
  const { kv, ...overrides } = options;

  const base = {
    Sandbox: unstubbed("Sandbox"),
    TICKETS: fakeKV(kv ?? {}),
    LOADER: unstubbed("LOADER"),
    DB: unstubbed("DB"),
    BLOBS: unstubbed("BLOBS"),
    AI: unstubbed("AI"),
    VECTORIZE: unstubbed("VECTORIZE"),
    TICKET_WF: unstubbed("TICKET_WF"),
    SPIKE_TOKEN: "test-spike-token",
    GITHUB_TOKEN: "test-github-token",
    GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
  };

  return { ...base, ...overrides } as unknown as Env;
}
