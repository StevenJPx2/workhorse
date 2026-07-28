// Access point for the relational plane.
//
// The query layer itself lives in @workhorse/db; this is only the seam that
// decides WHEN a Db is constructed. One instance per `env` object, memoized in a
// WeakMap: a Worker gets a fresh `env` per request, so this is effectively
// per-request without threading an extra parameter through every signature.
//
// A WeakMap rather than a module-level singleton because a module global is
// shared across requests in the same isolate — and would pin the first request's
// bindings for every later one.

import type { Env } from "@workhorse/api";
import { createDb, type Db } from "@workhorse/db";

const instances = new WeakMap<object, Db>();

/** The Db for this env, constructed once per env object. */
export function db(env: Pick<Env, "DB">): Db {
  const existing = instances.get(env);
  if (existing) return existing;

  const created = createDb(env.DB);
  instances.set(env, created);
  return created;
}
