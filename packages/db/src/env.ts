// The per-env access point for the relational plane.
//
// `createDb` takes a binding; this decides WHEN one is constructed. One instance
// per `env` object, memoized in a WeakMap: a Worker gets a fresh `env` per
// request, so this is effectively per-request without threading an extra
// parameter through every signature.
//
// A WeakMap rather than a module-level singleton because a module global is
// shared across requests in the same isolate — and would pin the first request's
// bindings for every later one.
//
// Lives here rather than in the worker so that every package needing a Db
// (events, intake, server) shares ONE instance per request instead of each
// constructing its own.

import { createDb, type Db } from "./db";

/** The subset of Env this needs — kept structural to avoid depending on the api package. */
export interface DbEnv {
  DB: D1Database;
}

const instances = new WeakMap<object, Db>();

/** The Db for this env, constructed once per env object. */
export function db(env: DbEnv): Db {
  const existing = instances.get(env);
  if (existing) return existing;

  const created = createDb(env.DB);
  instances.set(env, created);
  return created;
}
