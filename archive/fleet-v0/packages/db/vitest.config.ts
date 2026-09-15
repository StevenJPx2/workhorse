// The db package runs its tests inside workerd against a REAL D1 instance, not a
// mock. A fake D1 would happily accept SQL that SQLite rejects — and for a layer
// whose entire job is generating correct SQL, that is the only failure mode worth
// testing for.
//
// Migrations are read HERE (Node side, filesystem available) and handed to the
// tests as a binding, because workerd has no fs. They come from the same
// generated migration wrangler applies to prod, so a schema.ts change that fails
// to migrate fails the tests rather than passing against stale DDL.
//
// `cloudflareTest` is a Vite PLUGIN, not a pool: it both selects the workerd pool
// and registers the `cloudflare:test` module. Passing the same options to
// `cloudflarePool` leaves that module unresolvable.

import { join } from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Absolute, resolved from this file: the root runner invokes this config with the
// workspace root as cwd, so a relative path resolves against the wrong directory.
const migrations = await readD1Migrations(join(import.meta.dirname, "../../worker/migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/wrangler.toml" },
      miniflare: {
        // Each test file gets its own storage, so one file's rows cannot leak
        // into another's assertions.
        isolatedStorage: true,
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    name: "db",
    // Colocated: each repo directory holds its own __tests__.
    include: ["src/**/__tests__/**/*.test.ts"],
    // Migrates and truncates before every test, so no test file has to.
    setupFiles: ["./test/setup.ts"],
  },
});
