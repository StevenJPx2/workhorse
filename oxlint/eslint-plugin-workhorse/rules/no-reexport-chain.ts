/**
 * Disallow re-exporting items that are themselves re-exports (chained re-exports).
 *
 * When you re-export something, it should come from its canonical source (where it's
 * defined), not from an intermediate file that also re-exports it. This prevents
 * broken imports when intermediate files are refactored.
 *
 * Examples:
 * - ❌ `export { Foo } from "./agent"` when agent.ts has `export type { Foo } from "./types"`
 * - ✅ `export { Foo } from "./types"` (import from canonical source)
 * - ✅ `export { Foo } from "./agent"` when Foo is defined in agent.ts
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isIndexFile, parseFileContext, shouldSkipFile } from "./utils";

/** Parse a file and extract what it re-exports (vs defines locally) */
function getReexportsFromFile(filePath: string): Map<string, string> {
  const reexports = new Map<string, string>(); // name -> source module

  if (!existsSync(filePath)) return reexports;

  const content = readFileSync(filePath, "utf-8");

  // Match: export { Foo, Bar } from "./source"
  // Match: export type { Foo } from "./source"
  const namedReexportRegex =
    /export\s+(?:type\s+)?{\s*([^}]+)\s*}\s*from\s*["']([^"']+)["']/g;
  let match;
  while ((match = namedReexportRegex.exec(content)) !== null) {
    const names = match[1].split(",").map((n) =>
      n
        .trim()
        .split(/\s+as\s+/)[0]
        .trim(),
    );
    const source = match[2];
    for (const name of names) {
      if (name) reexports.set(name, source);
    }
  }

  // Match: export * from "./source" (namespace re-export - all names from source)
  // We can't know specific names without parsing the source, so we skip these
  // The rule will only catch explicit named re-exports

  return reexports;
}

interface ResolvedImport {
  path: string;
  isBarrel: boolean; // true if resolved to an index.ts file
}

/** Resolve a relative import path to an absolute file path */
function resolveImportPath(
  importPath: string,
  fromFile: string,
): ResolvedImport | null {
  const dir = path.dirname(fromFile);

  // Try direct file extensions first (not barrels)
  for (const ext of [".ts", ".tsx"]) {
    const resolved = path.resolve(dir, importPath + ext);
    if (existsSync(resolved)) return { path: resolved, isBarrel: false };
  }

  // Try folder with index.ts (barrel)
  for (const ext of ["/index.ts", "/index.tsx"]) {
    const resolved = path.resolve(dir, importPath + ext);
    if (existsSync(resolved)) return { path: resolved, isBarrel: true };
  }

  // Try without adding extension (might already have one)
  const direct = path.resolve(dir, importPath);
  if (existsSync(direct)) {
    const isBarrel = path.basename(direct).startsWith("index.");
    return { path: direct, isBarrel };
  }

  return null;
}

const rule = {
  meta: {
    type: "suggestion" as const,
    docs: {
      description:
        "Disallow re-exporting items that are themselves re-exports. Import from the canonical source instead.",
    },
    messages: {
      chainedReexport:
        '"{{name}}" is re-exported from "{{intermediate}}", but it originates from "{{canonical}}". Import from the canonical source.',
    },
  },

  create(context: any) {
    const ctx = parseFileContext(context.filename);
    if (shouldSkipFile(ctx)) return {};

    // Only check barrel files - they're the ones doing re-exports
    if (!isIndexFile(ctx)) return {};

    // Cache of parsed files
    const fileCache = new Map<string, Map<string, string>>();

    function getReexports(filePath: string): Map<string, string> {
      if (!fileCache.has(filePath)) {
        fileCache.set(filePath, getReexportsFromFile(filePath));
      }
      return fileCache.get(filePath)!;
    }

    function checkExport(node: any) {
      if (!node.source) return;

      const source: string = node.source.value;

      // Only check relative imports
      if (!source.startsWith(".")) return;

      const resolved = resolveImportPath(source, context.filename);
      if (!resolved) return;

      // Skip barrel files - re-exporting from a sub-barrel is the intended pattern
      // e.g., `export { Foo } from "./submodule"` where submodule/index.ts re-exports Foo
      if (resolved.isBarrel) return;

      const reexports = getReexports(resolved.path);
      if (reexports.size === 0) return;

      // Check each specifier
      const specifiers = node.specifiers || [];
      for (const spec of specifiers) {
        const name = spec.local?.name || spec.exported?.name;
        if (!name) continue;

        const canonicalSource = reexports.get(name);
        if (canonicalSource) {
          context.report({
            node: spec,
            messageId: "chainedReexport",
            data: {
              name,
              intermediate: source,
              canonical: canonicalSource,
            },
          });
        }
      }
    }

    return {
      ExportNamedDeclaration: checkExport,
    };
  },
};

export default rule;
