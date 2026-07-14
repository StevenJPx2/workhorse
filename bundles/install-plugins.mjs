// Build-time plugin installer: reads bundles/plugins.json and produces the
// Pi home (settings.json + local extensions). Runs inside the Docker build.
//
// Adding a plugin = one line in bundles/plugins.json (+ optionally a .ts file
// under bundles/extensions/). Stage gating is separate and declarative: a
// plugin's tools only become callable in a workflow stage when that stage's
// tools[] allowlist names them (pi-workflow enforces this per task).

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bundles = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(bundles, "plugins.json"), "utf8"));
const piHome = process.env.PI_HOME || "/root/.pi/agent";

mkdirSync(piHome, { recursive: true });

// settings.json: packages + defaults from the manifest.
const settings = { packages: manifest.packages ?? [], ...(manifest.settings ?? {}) };
writeFileSync(join(piHome, "settings.json"), JSON.stringify(settings, null, 2));
console.log(`settings.json: ${settings.packages.length} packages`);

// Local extensions (single .ts files) → ~/.pi/agent/extensions/
const extDir = join(piHome, "extensions");
mkdirSync(extDir, { recursive: true });
for (const rel of manifest.extensions ?? []) {
  const src = join(bundles, rel);
  if (!existsSync(src)) throw new Error(`extension missing: ${rel}`);
  cpSync(src, join(extDir, rel.split("/").pop()));
  console.log(`extension: ${rel}`);
}
