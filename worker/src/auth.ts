// Access point for the model credential.
//
// Same pattern as ./db: the logic lives in @workhorse/auth, this only decides
// when the store is constructed. Memoized per `env` object — a Worker gets a
// fresh env per request, so this is effectively per-request without threading an
// extra parameter through every signature.

import type { Env } from "@workhorse/api";
import { ModelTokenStore } from "@workhorse/auth";

const instances = new WeakMap<object, ModelTokenStore>();

/** The model-token store for this env, constructed once per env object. */
export function modelToken(env: Pick<Env, "TICKETS">): ModelTokenStore {
  const existing = instances.get(env);
  if (existing) return existing;

  const created = new ModelTokenStore(env.TICKETS);
  instances.set(env, created);
  return created;
}
