// Build-time sandbox installer: produces the Pi home (settings.json +
// extensions) inside the Docker build.
//
// - pi.json declares Pi extension PACKAGES (npm) + settings.
// - Sandbox-side plugin tools are DISCOVERED: every plugins/<name>/extension.ts
//   in the workspace is installed as ~/.pi/agent/extensions/<name>.ts.
//   Adding a plugin with a sandbox half = drop an extension.ts in its folder.
//
// Stage gating is separate and declarative: a plugin's tools only become
// callable in a workflow stage when that stage's tools[] allowlist names
// them (pi-workflow enforces this per task).

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sandboxDir = dirname(fileURLToPath(import.meta.url));
const root = join(sandboxDir, "..");
const manifest = JSON.parse(readFileSync(join(sandboxDir, "pi.json"), "utf8"));
const piHome = process.env.PI_HOME || "/root/.pi/agent";

mkdirSync(piHome, { recursive: true });

// settings.json: packages + defaults from the manifest.
const settings = { packages: manifest.packages ?? [], ...(manifest.settings ?? {}) };
writeFileSync(join(piHome, "settings.json"), JSON.stringify(settings, null, 2));
console.log(`settings.json: ${settings.packages.length} packages`);

// Plugin extensions: scan plugins/*/extension.ts → ~/.pi/agent/extensions/<plugin>.ts
const extDir = join(piHome, "extensions");
mkdirSync(extDir, { recursive: true });
const pluginsDir = join(root, "plugins");
let count = 0;
for (const name of existsSync(pluginsDir) ? readdirSync(pluginsDir) : []) {
  const src = join(pluginsDir, name, "extension.ts");
  if (!existsSync(src)) continue;
  cpSync(src, join(extDir, `${name}.ts`));
  console.log(`extension: ${name}`);
  count++;
}
if (count === 0) throw new Error("no plugin extensions found — wrong build context?");
