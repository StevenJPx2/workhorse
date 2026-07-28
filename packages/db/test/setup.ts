// Registered as vitest `setupFiles`, so every test file gets a migrated, empty
// database without importing anything.
//
// Lives in test/ rather than beside the tests it serves: it is harness wiring
// (paired with wrangler.toml), not colocated logic, and a non-test file under
// src/ that only tests import would read as dead code.

import { applyD1Migrations, type D1Migration, env } from "cloudflare:test";
import { beforeEach } from "vitest";

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

beforeEach(async () => {
  // Schema comes from the GENERATED migrations — the same files wrangler applies
  // to production — so a schema change that fails to migrate fails the tests
  // instead of passing against stale hand-written DDL.
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

  // isolatedStorage isolates per test FILE, not per test. Without this, rows
  // accumulate across cases in one file and any assertion on a full list
  // silently reads its neighbours' data.
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
});
