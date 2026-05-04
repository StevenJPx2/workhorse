#!/usr/bin/env bun
/**
 * Build script for Jiratown TUI.
 *
 * Bundles the TUI application into a single executable using Bun's bundler.
 * Uses the @opentui/solid Babel plugin to transform SolidJS JSX.
 * Outputs to packages/tui/dist/jiratown.js
 *
 * Usage:
 *   bun scripts/build-tui.ts           # Build TUI
 *   bun scripts/build-tui.ts --minify  # Build with minification
 *
 * @module scripts/build-tui
 */

import { resolve } from "node:path";
import { parseArgs } from "node:util";

const TUI_DIR = resolve(import.meta.dir, "../packages/tui");

// Import the Solid transform plugin from the TUI package's node_modules
const { createSolidTransformPlugin } = await import(
  resolve(TUI_DIR, "node_modules/@opentui/solid/scripts/solid-plugin.ts")
);
const ENTRY = resolve(TUI_DIR, "src/index.tsx");
const OUTDIR = resolve(TUI_DIR, "dist");

interface BuildOptions {
  minify: boolean;
  sourcemap: boolean;
}

async function build(options: BuildOptions): Promise<void> {
  const start = performance.now();

  console.log("\n⚡ Building @jiratown/tui...\n");

  const result = await Bun.build({
    entrypoints: [ENTRY],
    outdir: OUTDIR,
    target: "bun",
    format: "esm",
    minify: options.minify,
    sourcemap: options.sourcemap ? "linked" : "none",
    plugins: [createSolidTransformPlugin()],
    external: [
      // Keep native modules external - they can't be bundled
      "keytar",
      // Keep heavy ML dependencies external
      "@huggingface/transformers",
      "onnxruntime-node",
      "retriv",
      // drizzle has dynamic requires that break bundling
      "@libsql/client",
      "drizzle-orm",
    ],
    naming: {
      entry: "jiratown.js",
    },
  });

  if (!result.success) {
    console.error("Build failed:\n");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  const duration = performance.now() - start;
  const output = result.outputs[0];
  const size = output ? formatSize(output.size) : "unknown";

  console.log(`✓ Built dist/jiratown.js (${size})`);
  console.log(`  Duration: ${formatDuration(duration)}`);
  console.log(`  Minified: ${options.minify}`);
  console.log(`  Sourcemap: ${options.sourcemap}\n`);
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function main(): void {
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
  -h, --help       Show this help message
  -m, --minify     Minify the output (default: false)
  -s, --sourcemap  Generate sourcemap (default: true)

Examples:
  bun scripts/build-tui.ts              # Development build
  bun scripts/build-tui.ts --minify     # Production build
`);
    process.exit(0);
  }

  build({
    minify: values.minify ?? false,
    sourcemap: values.sourcemap ?? true,
  }).catch((error) => {
    console.error("Build failed:", error);
    process.exit(1);
  });
}

main();
