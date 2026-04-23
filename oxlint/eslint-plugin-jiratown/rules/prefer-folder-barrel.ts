import { isIndexFile, parseFileContext, shouldSkipFile } from "./utils.ts";

/**
 * Detect non-index files that only contain barrel exports (re-exports) from sibling files.
 *
 * When a file like `parser.ts` only re-exports from sibling files in the same directory:
 * ```ts
 * export { parseSessionMemory } from "./parse.ts";
 * export { serializeSessionMemory } from "./serialize.ts";
 * ```
 *
 * It should be refactored to a folder structure:
 * ```
 * parser/
 * ├── index.ts      # the barrel exports
 * ├── parse.ts      # moved here
 * └── serialize.ts  # moved here
 * ```
 *
 * Files that re-export from parent directories (../) or subdirectories are not flagged,
 * as they serve as type aliases or convenience re-exports.
 */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Suggest converting non-index barrel files to folder structure with index.ts",
    },
    messages: {
      preferFolderBarrel:
        'File "{{filename}}" only contains re-exports from sibling files. Convert to folder: {{folderName}}/index.ts with source files moved inside.',
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
        // Only report if:
        // - File has sibling re-exports
        // - File has NO non-sibling re-exports (type alias files re-export from other dirs)
        // - File has NO other statements
        if (hasSiblingReExports && !hasNonSiblingReExports && !hasOtherStatements && programNode) {
          context.report({
            node: programNode,
            messageId: "preferFolderBarrel",
            data: {
              filename: ctx.basename,
              folderName: ctx.nameWithoutExt,
            },
          });
        }
      },
    };
  },
};

export default rule;
