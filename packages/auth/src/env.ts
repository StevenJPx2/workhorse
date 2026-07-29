// The per-env access point for the model credential.
//
// Same shape as @workhorse/db's `db(env)`: the store's logic lives in
// ./model-token, this only decides when one is constructed. Memoized per `env`
// object — a Worker gets a fresh env per request, so this is effectively
// per-request without threading an extra parameter through every signature.

import { ModelTokenStore } from "./model-token";

/** The subset of Env this needs — structural, so no dependency on the api package. */
export interface TokenEnv {
  TICKETS: KVNamespace;
}

const instances = new WeakMap<object, ModelTokenStore>();

/** The model-token store for this env, constructed once per env object. */
export function modelToken(env: TokenEnv): ModelTokenStore {
  const existing = instances.get(env);
  if (existing) return existing;

  const created = new ModelTokenStore(env.TICKETS);
  instances.set(env, created);
  return created;
}
