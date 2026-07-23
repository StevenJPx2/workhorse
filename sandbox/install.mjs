// Build-time sandbox installer: writes the Pi home settings.json inside the
// Docker build.
//
// Under the flue-first engine, agent loops run in the Worker (not as Pi
// subprocesses), so there are NO sandbox-scanned tool extensions anymore —
// plugin tools live worker-side in plugins/<name>/tools/ and reach the
// container over the sandbox handle. The remaining Pi packages (auth, magic
// context, aft-pi) are baked via pi.json for any residual Pi tooling.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sandboxDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(sandboxDir, "pi.json"), "utf8"));
const piHome = process.env.PI_HOME || "/root/.pi/agent";

mkdirSync(piHome, { recursive: true });

// settings.json: packages + defaults from the manifest.
const settings = { packages: manifest.packages ?? [], ...(manifest.settings ?? {}) };
writeFileSync(join(piHome, "settings.json"), JSON.stringify(settings, null, 2));
console.log(`settings.json: ${settings.packages.length} packages`);
