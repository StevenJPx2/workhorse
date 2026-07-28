// drizzle-kit config. `generate` diffs schema.ts against the migration history
// and writes SQL; it never touches a database, so no credentials are needed for
// the common path.
//
// Applying is wrangler's job (`bun run migrate:local` / `migrate:remote`) rather
// than drizzle-kit's d1-http driver: wrangler already holds the account
// credentials, tracks applied migrations in D1 itself, and is what deploy runs.
// Adding a second migration ledger would let the two disagree.

// `studio` additionally needs credentials. It points at the LOCAL miniflare D1
// file, not production: browsing prod through a GUI is a foot-gun, and the local
// database is the one a dev loop actually iterates on. Find it with:
//   ls worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
// and pass it as LOCAL_D1 (the filename is a content hash, so it is not stable
// enough to hard-code).

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Relative to cwd, not import.meta.dirname: drizzle-kit bundles this config, and
// import.meta.dirname is undefined in the bundle. drizzle-kit runs from the
// config's own directory, so cwd is packages/db.
const D1_STATE = resolve("../../worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

/** The largest local D1 sqlite file — miniflare names them by content hash. */
function findLocalD1(): string | undefined {
  if (process.env.LOCAL_D1) return process.env.LOCAL_D1;
  if (!existsSync(D1_STATE)) return undefined;

  const candidates = readdirSync(D1_STATE).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  return candidates[0] ? resolve(D1_STATE, candidates[0]) : undefined;
}

const localD1 = findLocalD1();

export default defineConfig({
  dialect: "sqlite",
  // Glob, not a single file: adding a table is a new file in src/schema/ with no
  // config change. drizzle-kit unions every table it finds.
  schema: "./src/schema/*.ts",
  // Wrangler looks for migrations here (see worker/wrangler.jsonc migrations_dir).
  out: "../../worker/migrations",
  ...(localD1 ? { dbCredentials: { url: localD1 } } : {}),
});
