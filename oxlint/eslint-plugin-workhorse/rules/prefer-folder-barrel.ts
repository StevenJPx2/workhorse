import path from "node:path";

import { isIndexFile, parseFileContext, shouldSkipFile } from "./utils.ts";

/**
 * Detect two patterns that suggest files should be moved into a folder:
 *
 * **Pattern 1 – Barrel-only file:**
 * A non-index file like `parser.ts` that only re-exports from sibling files:
 * ```ts
 * export { parseSessionMemory } from "./parse.ts";
 * export { serializeSessionMemory } from "./serialize.ts";
 * ```
 * Should be refactored to:
 * ```
 * parser/
 * ├── index.ts      # the barrel exports
 * ├── parse.ts      # moved here
 * └── serialize.ts  # moved here
 * ```
 *
 * **Pattern 2 – Hyphen-suffixed sibling files:**
 * A group of files sharing a common base name via hyphen suffixes, e.g.:
 * ```
 * indexer.ts
 * indexer-utils.ts
 * indexer-types.ts
 * ```
 * Should be refactored to:
 * ```
 * indexer/
 * ├── index.ts
 * ├── indexer.ts
 * ├── utils.ts
 * └── types.ts
 * ```
 *
 * Files that re-export from parent directories (../) or subdirectories are not flagged,
 * as they serve as type aliases or convenience re-exports.
 */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest converting non-index barrel files to folder structure with index.ts",
    },
    messages: {
      preferFolderBarrel:
        'File "{{filename}}" only contains re-exports from sibling files. Convert to folder: {{folderName}}/index.ts with source files moved inside.',
      preferFolderSiblings:
        'File "{{filename}}" has hyphen-suffixed siblings (e.g. "{{example}}") that share its base name. Move them into a folder: {{folderName}}/',
    },
  },

  create(context: any) {
    const ctx = parseFileContext(context.filename);

    // Skip index files - they're supposed to be barrels
    if (isIndexFile(ctx) || shouldSkipFile(ctx)) {
      return {};
    }

    // Track what we find in the file
    let hasSiblingReExports = false;
    let hasNonSiblingReExports = false;
    let hasOtherStatements = false;
    let programNode: any = null;

    /**
     * Check if a source path is a sibling (same directory, not parent or subdirectory)
     * Sibling: "./foo.ts", "./bar"
     * Not sibling: "../foo.ts", "./sub/foo.ts", "package"
     */
    function isSiblingImport(source: string): boolean {
      // Must start with ./
      if (!source.startsWith("./")) return false;
      // Must not have additional path separators (except the leading ./)
      const rest = source.slice(2);
      return !rest.includes("/");
    }

    /**
     * Check whether the current file has hyphen-suffixed siblings on disk.
     * e.g. if the current file is `indexer.ts`, look for siblings like
     * `indexer-utils.ts`, `indexer-types.ts`, etc.
     *
     * Uses the physical filesystem via `require("fs")` so it works at lint time.
     */
    function findHyphenSuffixedSiblings(): string[] {
      try {
        const fs: typeof import("fs") = require("fs");
        const dir = ctx.dirname;
        const base = ctx.nameWithoutExt; // e.g. "indexer"
        const entries = fs.readdirSync(dir);
        return entries.filter((entry: string) => {
          const entryExt = path.extname(entry);
          if (entryExt !== ".ts" && entryExt !== ".tsx") return false;
          const entryBase = entry.slice(0, -entryExt.length);
          // Match "base-<something>" but not "base" itself
          return (
            entryBase.startsWith(`${base}-`) &&
            entryBase.length > base.length + 1
          );
        });
      } catch {
        return [];
      }
    }

    return {
      Program(node: any) {
        programNode = node;
      },

      // Track re-exports (export from)
      ExportNamedDeclaration(node: any) {
        if (node.source) {
          const source: string = node.source.value;
          if (isSiblingImport(source)) {
            hasSiblingReExports = true;
          } else {
            hasNonSiblingReExports = true;
          }
        } else if (node.declaration) {
          // This is an inline export: export const x = 1
          hasOtherStatements = true;
        }
      },

      ExportAllDeclaration(node: any) {
        const source: string = node.source?.value ?? "";
        if (isSiblingImport(source)) {
          hasSiblingReExports = true;
        } else {
          hasNonSiblingReExports = true;
        }
      },

      // Track declarations (not exports)
      VariableDeclaration(_node: any) {
        hasOtherStatements = true;
      },
      FunctionDeclaration(_node: any) {
        hasOtherStatements = true;
      },
      ClassDeclaration(_node: any) {
        hasOtherStatements = true;
      },
      TSTypeAliasDeclaration(_node: any) {
        hasOtherStatements = true;
      },
      TSInterfaceDeclaration(_node: any) {
        hasOtherStatements = true;
      },
      TSEnumDeclaration(_node: any) {
        hasOtherStatements = true;
      },
      ImportDeclaration(_node: any) {
        // Imports that are used locally (not just re-exported) indicate real code
        // But we can't easily tell if they're used, so we'll be lenient here
      },

      // Check at the end of the file
      "Program:exit"(_node: any) {
        if (!programNode) return;

        // Pattern 1: barrel-only file (only sibling re-exports, nothing else)
        if (
          hasSiblingReExports &&
          !hasNonSiblingReExports &&
          !hasOtherStatements
        ) {
          context.report({
            node: programNode,
            messageId: "preferFolderBarrel",
            data: {
              filename: ctx.basename,
              folderName: ctx.nameWithoutExt,
            },
          });
          return;
        }

        // Pattern 2: file has hyphen-suffixed siblings sharing its base name
        const siblings = findHyphenSuffixedSiblings();
        if (siblings.length > 0) {
          context.report({
            node: programNode,
            messageId: "preferFolderSiblings",
            data: {
              filename: ctx.basename,
              example: siblings[0],
              folderName: ctx.nameWithoutExt,
            },
          });
        }
      },
    };
  },
};

export default rule;
