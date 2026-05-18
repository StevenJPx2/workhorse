#!/usr/bin/env bun
/**
 * Build script for Workhorse TUI.
 *
 * Bundles the TUI into a single JS file. The bundle still requires the monorepo's
 * node_modules for native deps (@opentui/core, keytar, @libsql, etc.).
 *
 * For development: bun run dev (from packages/tui/)
 * Run bundle: bun packages/tui/dist/workhorse.js
 *
 * @module scripts/build-tui
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  patchDynamicImports,
  copyTreeSitterAssets,
  copyDrizzleMigrations,
  copySkillFiles,
  formatDuration,
  formatSize,
} from "./build-tui-utils.ts";

const ROOT = resolve(import.meta.dir, "..");
const TUI = resolve(ROOT, "packages/tui");
const ENTRY = resolve(TUI, "src/index.tsx");
const OUTDIR = resolve(TUI, "dist");
const BUNDLE = resolve(OUTDIR, "workhorse.js");

const { createSolidTransformPlugin } = await import(
  resolve(TUI, "node_modules/@opentui/solid/scripts/solid-plugin.ts")
);

// oxlint-disable-next-line workhorse/no-single-reference-function
async function build(minify: boolean, sourcemap: boolean): Promise<void> {
  // oxlint-disable-next-line workhorse/no-single-use-variable
  const start = performance.now();
  console.log("\n⚡ Building workhorse...\n");

  // Clean dist before each build to prevent stale files accumulating
  if (existsSync(OUTDIR)) rmSync(OUTDIR, { recursive: true, force: true });
  mkdirSync(OUTDIR, { recursive: true });

  const result = await Bun.build({
    entrypoints: [ENTRY],
    outdir: OUTDIR,
    target: "bun",
    format: "esm",
    minify,
    sourcemap: sourcemap ? "linked" : "none",
    plugins: [createSolidTransformPlugin()],
    external: [
      // Playwright has native deps that can't be bundled - must be installed at runtime
      "playwright",
      "playwright-core",
      // retriv + dependencies have native bindings (onnxruntime, libsql, transformers)
      "retriv",
      "@libsql/client",
      "@huggingface/transformers",
      "onnxruntime-node",
      // @opentui/core has platform-specific native bindings and uses Bun asset imports
      "@opentui/core",
    ],
    naming: { entry: "workhorse.js" },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  patchDynamicImports(ROOT, BUNDLE);
  copyTreeSitterAssets(TUI, OUTDIR);
  copyDrizzleMigrations(ROOT, OUTDIR);
  copySkillFiles(ROOT, OUTDIR);

  // Prepend shebang so the bundle is directly executable (requires bun runtime)
  const existing = await Bun.file(BUNDLE).text();
  if (!existing.startsWith("#!/usr/bin/env bun")) {
    await Bun.write(BUNDLE, `#!/usr/bin/env bun\n${existing}`);
  }
  await import("node:fs/promises").then((fs) => fs.chmod(BUNDLE, 0o755));

  console.log(
    `✓ Built dist/workhorse.js (${result.outputs[0] ? formatSize(result.outputs[0].size) : "?"}) in ${formatDuration(performance.now() - start)}`,
  );
  console.log(`  Run with: bun packages/tui/dist/workhorse.js\n`);
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    minify: { type: "boolean", short: "m", default: false },
    sourcemap: { type: "boolean", short: "s", default: true },
    "no-sourcemap": { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(`
Usage: bun scripts/build-tui.ts [options]

Options:
  -h, --help       Show this help
  -m, --minify     Minify output (default: false)
  -s, --sourcemap  Generate sourcemap (default: true)

Examples:
  bun scripts/build-tui.ts              # Dev build
  bun scripts/build-tui.ts --minify     # Production build
`);
  process.exit(0);
}

build(values.minify ?? false, values["no-sourcemap"] ? false : (values.sourcemap ?? true)).catch(
  (e) => {
    console.error("Build failed:", e);
    process.exit(1);
  },
);
