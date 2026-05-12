#!/usr/bin/env bun
/**
 * Build script for Jiratown TUI.
 *
 * Bundles the TUI into a single JS file. The bundle still requires the monorepo's
 * node_modules for native deps (@opentui/core, keytar, @libsql, etc.).
 *
 * For development: bun run dev (from packages/tui/)
 * Run bundle: bun packages/tui/dist/jiratown.js
 *
 * @module scripts/build-tui
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  patchDynamicImports,
  copyTreeSitterAssets,
  copyDrizzleMigrations,
  formatDuration,
  formatSize,
} from "./build-tui-utils.ts";

const ROOT = resolve(import.meta.dir, "..");
const TUI = resolve(ROOT, "packages/tui");
const ENTRY = resolve(TUI, "src/index.tsx");
const OUTDIR = resolve(TUI, "dist");
const BUNDLE = resolve(OUTDIR, "jiratown.js");

const { createSolidTransformPlugin } = await import(
  resolve(TUI, "node_modules/@opentui/solid/scripts/solid-plugin.ts")
);

// oxlint-disable-next-line jiratown/no-single-reference-function
async function build(minify: boolean, sourcemap: boolean): Promise<void> {
  // oxlint-disable-next-line jiratown/no-single-use-variable
  const start = performance.now();
  console.log("\n⚡ Building @stevenjpx2/jiratown-tui...\n");

  if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });

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
    ],
    naming: { entry: "jiratown.js" },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  patchDynamicImports(ROOT, BUNDLE);
  copyTreeSitterAssets(TUI, OUTDIR);
  copyDrizzleMigrations(ROOT, OUTDIR);

  console.log(
    `✓ Built dist/jiratown.js (${result.outputs[0] ? formatSize(result.outputs[0].size) : "?"}) in ${formatDuration(performance.now() - start)}`,
  );
  console.log(`  Run with: bun packages/tui/dist/jiratown.js\n`);
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    minify: { type: "boolean", short: "m", default: false },
    sourcemap: { type: "boolean", short: "s", default: true },
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

build(values.minify ?? false, values.sourcemap ?? true).catch((e) => {
  console.error("Build failed:", e);
  process.exit(1);
});
