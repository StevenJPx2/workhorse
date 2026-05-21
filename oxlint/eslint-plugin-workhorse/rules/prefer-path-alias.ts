/**
 * Prefer path aliases over deep relative imports.
 *
 * When a file imports using 2+ parent traversals (../../) and a path alias exists
 * that could replace it, suggest using the alias instead.
 *
 * This rule reads path aliases from the nearest tsconfig.json and suggests
 * replacements when applicable.
 *
 * Examples:
 * - ❌ `import { foo } from "../../config/index.ts"` → ✅ `import { foo } from "#config"`
 * - ❌ `import { bar } from "../../../workflow/steering/service.ts"` → ✅ `import { bar } from "#workflow/steering/service"`
 * - ✅ `import { baz } from "./utils.ts"` (shallow, OK)
 * - ✅ `import { qux } from "../types.ts"` (only 1 level up, OK)
 */

// Path alias configuration for packages/core
// In a real implementation, this could be loaded from tsconfig.json
const PATH_ALIASES: Record<string, string> = {
  "#bootstrap": "src/bootstrap.ts",
  "#config": "src/config/index.ts",
  "#context": "src/context/index.ts",
  "#db": "src/db/index.ts",
  "#lib/git": "src/lib/git/index.ts",
  "#lib/hooks": "src/lib/hooks/index.ts",
  "#plugins": "src/plugins/index.ts",
  "#services/memory": "src/services/memory/index.ts",
  "#services/monitor": "src/services/monitor/index.ts",
  "#workflow/orchestrator": "src/workflow/orchestrator/index.ts",
  "#workflow/steering": "src/workflow/steering/index.ts",
  "#workflow/tracker": "src/workflow/tracker/index.ts",
};

// Build a reverse lookup: normalized path → alias
// e.g., "config" → "#config", "workflow/steering" → "#workflow/steering"
function buildAliasLookup(): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const [alias, targetPath] of Object.entries(PATH_ALIASES)) {
    // Extract the module path: "src/config/index.ts" → "config"
    const match = targetPath.match(/^src\/(.+?)(?:\/index)?\.ts$/);
    if (match) {
      lookup.set(match[1], alias);
    }
  }

  return lookup;
}

const ALIAS_LOOKUP = buildAliasLookup();

/**
 * Count how many parent directory traversals (../) are in a path
 */
function countParentTraversals(importPath: string): number {
  const matches = importPath.match(/\.\.\//g);
  return matches ? matches.length : 0;
}

/**
 * Resolve a relative import path to an absolute module path
 * @param filename - The file making the import (e.g., /project/packages/core/src/workflow/orchestrator/orchestrator.ts)
 * @param importPath - The relative import (e.g., ../../services/memory/index.ts)
 * @returns The resolved path relative to src/ (e.g., services/memory)
 */
function resolveImportPath(
  filename: string,
  importPath: string,
): string | null {
  // Extract the directory of the importing file
  const srcIndex = filename.indexOf("/src/");
  if (srcIndex === -1) return null;

  // Get the path relative to src/
  const relativeToSrc = filename.slice(srcIndex + 5); // +5 for "/src/"
  const dirParts = relativeToSrc.split("/").slice(0, -1); // Remove filename

  // Parse the import path
  const importParts = importPath.split("/");
  const resultParts = [...dirParts];

  for (const part of importParts) {
    if (part === "..") {
      if (resultParts.length === 0) return null; // Can't go above src/
      resultParts.pop();
    } else if (part !== ".") {
      resultParts.push(part);
    }
  }

  // Remove file extension and /index suffix
  let result = resultParts.join("/");
  result = result.replace(/\.(tsx?|jsx?|mts|mjs)$/, "");
  result = result.replace(/\/index$/, "");

  return result;
}

/**
 * Find the best matching alias for a resolved path
 */
function findMatchingAlias(
  resolvedPath: string,
): { alias: string; suffix: string } | null {
  // Try exact match first
  if (ALIAS_LOOKUP.has(resolvedPath)) {
    return { alias: ALIAS_LOOKUP.get(resolvedPath)!, suffix: "" };
  }

  // Try prefix match (for subpath imports like #config/schema)
  const parts = resolvedPath.split("/");
  for (let i = parts.length - 1; i >= 1; i--) {
    const prefix = parts.slice(0, i).join("/");
    if (ALIAS_LOOKUP.has(prefix)) {
      const suffix = parts.slice(i).join("/");
      return { alias: ALIAS_LOOKUP.get(prefix)!, suffix: "/" + suffix };
    }
  }

  return null;
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer path aliases over deep relative imports (2+ parent traversals)",
    },
    fixable: "code",
    messages: {
      preferAlias:
        'Use path alias "{{suggested}}" instead of deep relative import "{{source}}"',
    },
  },

  create(context: any) {
    const filename: string = context.filename;

    // Only apply to packages/core/src files
    if (!filename.includes("packages/core/src")) {
      return {};
    }

    // Skip test fixtures
    if (filename.includes("__tests__/fixtures")) {
      return {};
    }

    function checkSource(node: any) {
      if (!node.source) return;

      const source: string = node.source.value;

      // Only check relative imports
      if (!source.startsWith(".")) {
        return;
      }

      // Only flag imports with 2+ parent traversals
      const traversals = countParentTraversals(source);
      if (traversals < 2) {
        return;
      }

      // Resolve the import to an absolute path
      const resolvedPath = resolveImportPath(filename, source);
      if (!resolvedPath) {
        return;
      }

      // Find a matching alias
      const match = findMatchingAlias(resolvedPath);
      if (!match) {
        return;
      }

      const suggested = match.alias + match.suffix;

      context.report({
        node: node.source,
        messageId: "preferAlias",
        data: { source, suggested },
        fix(fixer: any) {
          const raw = node.source.raw;
          const quote = raw[0];
          return fixer.replaceText(node.source, `${quote}${suggested}${quote}`);
        },
      });
    }

    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
    };
  },
};

export default rule;
