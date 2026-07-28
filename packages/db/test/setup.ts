// Applies the real generated migrations to the test D1.

import { applyD1Migrations, type D1Migration, env } from "cloudflare:test";

// The pool's `env` is typed as Cloudflare.Env, so the test bindings are declared
// in that namespace rather than the older ProvidedEnv interface.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      /** Migrations read from worker/migrations by vitest.config.ts (Node side). */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

const TABLES = ["tickets", "escalations", "traces", "notifications", "scripts"] as const;

/**
 * Create the schema from the GENERATED migrations — the same files wrangler
 * applies to production. A schema.ts change that fails to migrate therefore
 * fails the tests, instead of passing against a stale hand-written DDL.
 *
 * Also truncates every table. `isolatedStorage` isolates per test FILE, not per
 * test, so without this rows accumulate across cases in the same file and any
 * assertion on a full list silently reads its neighbours' data.
 */
export async function applySchema(): Promise<void> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
}

export { env };
