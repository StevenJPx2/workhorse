/**
 * Utility functions for the TUI build script.
 * @module scripts/build-tui-utils
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { resolve, extname } from "node:path";

/** Patch dynamic platform imports - currently a no-op since all native deps are external */
export function patchDynamicImports(_root: string, _bundle: string): void {
  // Native dependencies (@opentui/core, @libsql/client, onnxruntime-node, sharp)
  // are now marked as external and installed at runtime, so no patching needed.
  console.log(`  ✓ Native deps are external (no patching needed)`);
}

export function copyTreeSitterAssets(tuiDir: string, outdir: string): void {
  const src = resolve(tuiDir, "tree-sitter");
  if (!existsSync(src)) return;
  const dest = resolve(outdir, "tree-sitter");
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(src)) {
    if ([".wasm", ".scm"].includes(extname(f))) copyFileSync(resolve(src, f), resolve(dest, f));
  }
}

/** Copy drizzle migrations to dist folder */
export function copyDrizzleMigrations(root: string, outdir: string): void {
  const src = resolve(root, "packages/core/drizzle");
  if (!existsSync(src)) return;

  // oxlint-disable-next-line no-single-reference-function -- recursive function
  const copyDir = (srcDir: string, destDir: string): void => {
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = resolve(srcDir, entry.name);
      const destPath = resolve(destDir, entry.name);
      if (entry.isDirectory()) copyDir(srcPath, destPath);
      else copyFileSync(srcPath, destPath);
    }
  };

  copyDir(src, resolve(outdir, "drizzle"));
  console.log("  ✓ Copied drizzle migrations");
}

/** Copy skill markdown files to dist folder */
export function copySkillFiles(root: string, outdir: string): void {
  const src = resolve(root, "packages/core/src/plugins/builtin/skills");
  if (!existsSync(src)) return;

  for (const f of readdirSync(src)) {
    if (extname(f) === ".md") {
      copyFileSync(resolve(src, f), resolve(outdir, f));
    }
  }
  console.log("  ✓ Copied skill files");
}

export const formatDuration = (ms: number): string =>
  ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;

export const formatSize = (b: number): string => {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(2)}MB`;
};
