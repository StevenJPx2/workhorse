/**
 * Utility functions for the TUI build script.
 * @module scripts/build-tui-utils
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

/** Patch dynamic platform imports to use absolute paths */
export function patchDynamicImports(root: string, bundle: string): void {
  const p = process.platform,
    a = process.arch;
  let content = readFileSync(bundle, "utf-8");
  let n = 0;

  // @opentui/core dynamic import
  const otuiPath = resolve(
    root,
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
    root,
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
    root,
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
    root,
    `node_modules/.bun/@img+sharp-${sharpPlatform}@0.34.5/node_modules/@img/sharp-${sharpPlatform}/lib/sharp-${sharpPlatform}.node`,
  );
  if (existsSync(sharpPath)) {
    content = content.replace(
      /`@img\/sharp-\$\{runtimePlatform\}\/sharp\.node`/g,
      `"${sharpPath}"`,
    );
    n++;
  }

  writeFileSync(bundle, content);
  console.log(`  ✓ Patched ${n} dynamic imports`);
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
  copyDirRecursive(src, resolve(outdir, "drizzle"));
  console.log("  ✓ Copied drizzle migrations");
}

function copyDirRecursive(srcDir: string, destDir: string): void {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = resolve(srcDir, entry.name);
    const destPath = resolve(destDir, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else copyFileSync(srcPath, destPath);
  }
}

export const formatDuration = (ms: number): string =>
  ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;

export const formatSize = (b: number): string => {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(2)}MB`;
};
