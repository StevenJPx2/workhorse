import fs from "node:fs";
import path from "node:path";

import { isIndexFile, parseFileContext, shouldSkipFile } from "./utils.ts";

/**
 * Detect files that are only imported by a single other non-index file in the same directory,
 * where the filename suggests it's a helper/sub-module of the importing file.
 *
 * This rule specifically targets patterns like:
 * - `renderer.ts` importing `tool-renderer.ts` (helper with related name)
 * - `client.ts` importing `client-utils.ts` (helper with related name)
 *
 * These should be colocated in a folder structure:
 * ```
 * renderer/
 * ├── index.ts
 * ├── notification.ts
 * └── tool.ts
 * ```
 *
 * The rule does NOT flag:
 * - Files imported by index.ts (these are legitimate module entry points)
 * - Files with standalone names that don't suggest a parent-child relationship
 */

/**
 * Compute the suggested new filename when colocating.
 * Removes the parent name prefix/suffix from the filename.
 *
 * Examples:
 * - overview-input.tsx -> input.tsx
 * - agent-status-utils.ts -> status-utils.ts
 * - tool-renderer.ts -> tool.ts (when importer is renderer.ts)
 */
function suggestColocatedName(filename: string, importerBase: string): string {
  const ext = path.extname(filename);
  const nameWithoutExt = filename.slice(0, -ext.length);

  // Remove prefix pattern: importerBase-rest -> rest
  if (nameWithoutExt.startsWith(`${importerBase}-`)) {
    return nameWithoutExt.slice(importerBase.length + 1) + ext;
  }

  // Remove suffix pattern: rest-importerBase -> rest
  if (nameWithoutExt.endsWith(`-${importerBase}`)) {
    return nameWithoutExt.slice(0, -(importerBase.length + 1)) + ext;
  }

  // Contains pattern: just remove the importerBase substring
  if (nameWithoutExt.includes(importerBase)) {
    return nameWithoutExt.replace(importerBase, "").replace(/^-|-$/g, "") + ext;
  }

  return filename;
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest colocating helper files that are only imported by one sibling file, and removing parent name prefix from files in folders",
    },
    messages: {
      preferColocate:
        'File "{{filename}}" is only imported by "{{importer}}" and appears to be a helper module. ' +
        "Consider moving both into a {{baseName}}/ folder (e.g., {{baseName}}/{{newName}}).",
      removeParentPrefix:
        'File "{{filename}}" has the parent folder name "{{parentName}}" as a prefix. ' +
        'Consider renaming it to "{{newName}}".',
    },
  },

  create(context: any) {
    const ctx = parseFileContext(context.filename);

    // Skip index files, test files, and non-source files
    if (isIndexFile(ctx) || shouldSkipFile(ctx)) {
      return {};
    }

    // Skip test files
    if (ctx.basename.includes(".test.")) {
      return {};
    }

    // Skip type-only files (types.ts, interfaces.ts)
    if (ctx.nameWithoutExt === "types" || ctx.nameWithoutExt === "interfaces") {
      return {};
    }

    let programNode: any = null;

    return {
      Program(node: any) {
        programNode = node;
      },

      "Program:exit"() {
        if (!programNode) return;

        try {
          // Check 1: File has parent folder name as prefix (e.g., overview/overview-header.tsx)
          const dirName = path.basename(ctx.dirname);
          if (ctx.nameWithoutExt.startsWith(`${dirName}-`)) {
            const ext = path.extname(ctx.basename);
            const newName = ctx.nameWithoutExt.slice(dirName.length + 1) + ext;
            context.report({
              node: programNode,
              messageId: "removeParentPrefix",
              data: {
                filename: ctx.basename,
                parentName: dirName,
                newName: newName,
              },
            });
            return;
          }

          // Check 2: File is a helper only imported by one sibling
          // Find all sibling source files
          const siblingFiles = getSiblingSourceFiles(ctx.dirname, ctx.basename);

          // Check which siblings import this file
          const importers = findImportersOfFile(ctx.dirname, ctx.nameWithoutExt, siblingFiles);

          // Only flag if exactly one non-index file imports this file
          if (importers.length !== 1) return;

          const importer = importers[0];
          const importerBase = importer.replace(/\.(ts|tsx)$/, "");

          // Skip if the importer is index.ts (legitimate module entry point)
          if (importerBase === "index") return;

          // Skip if the directory name matches the importer's base name
          // (files are already colocated in a properly named folder)
          if (dirName === importerBase) return;

          // Only flag if the filename suggests a helper relationship:
          // - Contains the importer's name (e.g., tool-renderer for renderer)
          // - Or has a hyphen suffix pattern (e.g., foo-utils, foo-helpers)
          const hasRelatedName =
            ctx.nameWithoutExt.includes(importerBase) ||
            importerBase.includes(ctx.nameWithoutExt) ||
            ctx.nameWithoutExt.startsWith(`${importerBase}-`) ||
            ctx.nameWithoutExt.endsWith(`-${importerBase}`);

          if (!hasRelatedName) return;

          context.report({
            node: programNode,
            messageId: "preferColocate",
            data: {
              filename: ctx.basename,
              importer: importer,
              baseName: importerBase,
              newName: suggestColocatedName(ctx.basename, importerBase),
            },
          });
        } catch {
          // Ignore filesystem errors
        }
      },
    };
  },
};

/**
 * Get all sibling source files in the same directory (excluding the current file)
 */
function getSiblingSourceFiles(dirname: string, currentBasename: string): string[] {
  const entries = fs.readdirSync(dirname);
  return entries.filter((entry) => {
    if (entry === currentBasename) return false;
    const ext = path.extname(entry);
    if (ext !== ".ts" && ext !== ".tsx") return false;
    if (entry.includes(".test.")) return false;
    return true;
  });
}

/**
 * Find which sibling files import the target file
 */
function findImportersOfFile(
  dirname: string,
  targetNameWithoutExt: string,
  siblingFiles: string[],
): string[] {
  const importers: string[] = [];

  // Patterns that would import this file:
  // import ... from "./targetName"
  // import ... from "./targetName.ts"
  const importPatterns = [
    new RegExp(`from\\s+["']\\./${targetNameWithoutExt}["']`),
    new RegExp(`from\\s+["']\\./${targetNameWithoutExt}\\.ts["']`),
    new RegExp(`from\\s+["']\\./${targetNameWithoutExt}\\.tsx["']`),
  ];

  for (const sibling of siblingFiles) {
    const siblingPath = path.join(dirname, sibling);
    try {
      const content = fs.readFileSync(siblingPath, "utf-8");
      const hasImport = importPatterns.some((pattern) => pattern.test(content));
      if (hasImport) {
        importers.push(sibling);
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return importers;
}

export default rule;
