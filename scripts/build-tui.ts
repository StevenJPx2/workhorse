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

import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, extname } from "node:path";
import { parseArgs } from "node:util";

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
  console.log("\n⚡ Building @jiratown/tui...\n");

  if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });

  const result = await Bun.build({
    entrypoints: [ENTRY],
    outdir: OUTDIR,
    target: "bun",
    format: "esm",
    minify,
    sourcemap: sourcemap ? "linked" : "none",
    plugins: [createSolidTransformPlugin()],
    external: [],
    naming: { entry: "jiratown.js" },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  patchDynamicImports();
  copyTreeSitterAssets();
  copyDrizzleMigrations();

  console.log(
    `✓ Built dist/jiratown.js (${result.outputs[0] ? formatSize(result.outputs[0].size) : "?"}) in ${formatDuration(performance.now() - start)}`,
  );
  console.log(`  Run with: bun packages/tui/dist/jiratown.js\n`);
}

/** Patch dynamic platform imports to use absolute paths */
function patchDynamicImports(): void {
  const p = process.platform,
    a = process.arch;
  let content = readFileSync(BUNDLE, "utf-8");
  let n = 0;

  // @opentui/core dynamic import
  const otuiPath = resolve(
    ROOT,
    `node_modules/.bun/@opentui+core-${p}-${a}@0.2.1/node_modules/@opentui/core-${p}-${a}/index.ts`,
  );
  if (existsSync(otuiPath)) {
    content = content.replace(
      /import\(`@opentui\/core-\$\{process\.platform\}-\$\{process\.arch\}\/index\.ts`\)/g,
      `import("${otuiPath}")`,
    );
    n++;
  }

  // @libsql dynamic require
  const lsqlTarget = p === "darwin" ? `darwin-${a}` : `linux-${a}-gnu`;
  const lsqlPath = resolve(
    ROOT,
    `node_modules/.bun/@libsql+${lsqlTarget}@0.5.29/node_modules/@libsql/${lsqlTarget}`,
  );
  if (existsSync(lsqlPath)) {
    content = content.replace(
      /return __require\(`@libsql\/\$\{target\}`\);/g,
      `return __require("${lsqlPath}");`,
    );
    n++;
  }

  // onnxruntime-node dynamic require
  const onnxPath = resolve(
    ROOT,
    `node_modules/.bun/onnxruntime-node@1.24.3/node_modules/onnxruntime-node/bin/napi-v6/${p}/${a}/onnxruntime_binding.node`,
  );
  if (existsSync(onnxPath)) {
    content = content.replace(
      /__require\(`\.\.\/bin\/napi-v6\/\$\{process\.platform\}\/\$\{process\.arch\}\/onnxruntime_binding\.node`\)/g,
      `__require("${onnxPath}")`,
    );
    n++;
  }

  // sharp dynamic require - patch the paths array to use absolute path
  const sharpPlatform = p === "darwin" ? `darwin-${a}` : `linux-${a}`;
  const sharpPath = resolve(
    ROOT,
    `node_modules/.bun/@img+sharp-${sharpPlatform}@0.34.5/node_modules/@img/sharp-${sharpPlatform}/lib/sharp-${sharpPlatform}.node`,
  );
  if (existsSync(sharpPath)) {
    // Replace the dynamic path in the paths array: `@img/sharp-${runtimePlatform}/sharp.node`
    content = content.replace(
      /`@img\/sharp-\$\{runtimePlatform\}\/sharp\.node`/g,
      `"${sharpPath}"`,
    );
    n++;
  }

  writeFileSync(BUNDLE, content);
  console.log(`  ✓ Patched ${n} dynamic imports`);
}

function copyTreeSitterAssets(): void {
  const src = resolve(TUI, "tree-sitter");
  if (!existsSync(src)) return;
  const dest = resolve(OUTDIR, "tree-sitter");
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(src)) {
    if ([".wasm", ".scm"].includes(extname(f))) copyFileSync(resolve(src, f), resolve(dest, f));
  }
}

/** Copy drizzle migrations to dist folder */
function copyDrizzleMigrations(): void {
  const src = resolve(ROOT, "packages/core/drizzle");
  if (!existsSync(src)) return;
  copyDirRecursive(src, resolve(OUTDIR, "drizzle"));
  console.log("  ✓ Copied drizzle migrations");

  // oxlint-disable-next-line jiratown/no-single-reference-function
  function copyDirRecursive(srcDir: string, destDir: string): void {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = resolve(srcDir, entry.name);
      const destPath = resolve(destDir, entry.name);
      if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
      else copyFileSync(srcPath, destPath);
    }
  }
}

const formatDuration = (ms: number) =>
  ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
const formatSize = (b: number) =>
  b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(2)}MB`;

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
