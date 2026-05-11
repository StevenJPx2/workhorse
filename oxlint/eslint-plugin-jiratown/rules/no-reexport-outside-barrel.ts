/**
 * Disallow re-exports outside of barrel (index) files.
 *
 * Re-exports should only appear in barrel files (index.ts/index.tsx) to maintain
 * a clean module structure. Non-barrel files should import what they need and
 * use it locally, not re-export for convenience.
 *
 * Examples:
 * - ❌ `export type { Foo } from "./types"` in models.ts
 * - ❌ `export { helper } from "../utils"` in service.ts
 * - ✅ `export { Foo } from "./foo"` in index.ts (barrel file)
 * - ✅ `export * from "./types"` in index.ts (barrel file)
 *
 * Auto-fix: Removes the re-export from the non-barrel file. The user should
 * manually add it to the appropriate barrel file if needed.
 */

import path from "node:path";

interface ReExportInfo {
  specifiers: string[];
  source: string;
  isTypeOnly: boolean;
  isNamespace: boolean; // export * from
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow re-exports outside of barrel (index) files. Re-exports should only be in index.ts files.",
    },
    fixable: "code" as const,
    messages: {
      noReexport:
        'Re-export from "{{source}}" should be in a barrel file (index.ts), not in {{filename}}. Move this to the nearest index.ts or remove it.',
      noReexportNamespace:
        'Namespace re-export from "{{source}}" should be in a barrel file (index.ts), not in {{filename}}.',
    },
  },

  create(context: any) {
    const filename: string = context.filename;
    const basename = path.basename(filename);
    const ext = path.extname(filename);

    // Skip non-TypeScript files
    if (ext !== ".ts" && ext !== ".tsx") {
      return {};
    }

    // Skip node_modules and dist
    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }

    // Skip barrel files - re-exports are allowed there
    const nameWithoutExt = basename.replace(ext, "");
    if (nameWithoutExt === "index") {
      return {};
    }

    // Skip test files
    if (/\.(test|spec)\.(ts|tsx)$/.test(filename)) {
      return {};
    }

    function checkExport(node: any) {
      // Must have a source (from clause) to be a re-export
      if (!node.source) {
        return;
      }

      const source: string = node.source.value;

      // Get the specifiers being exported
      const specifiers: string[] = [];
      let isTypeOnly = false;

      if (node.specifiers) {
        for (const spec of node.specifiers) {
          const name = spec.exported?.name ?? spec.local?.name ?? "unknown";
          specifiers.push(name);
        }
        // Check if it's a type-only export
        isTypeOnly = node.exportKind === "type";
      }

      const shortFilename = basename;

      context.report({
        node,
        messageId: "noReexport",
        data: {
          source,
          filename: shortFilename,
          specifiers: specifiers.join(", "),
        },
        fix(fixer: any) {
          // Remove the entire re-export statement
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const sourceText = sourceCode.text;

          let start = node.range[0];
          let end = node.range[1];

          // Walk back to remove leading whitespace/newline
          while (start > 0 && /[ \t]/.test(sourceText[start - 1])) {
            start--;
          }

          // Remove trailing newline if present
          if (sourceText[end] === "\n") {
            end++;
          } else if (sourceText[end] === "\r" && sourceText[end + 1] === "\n") {
            end += 2;
          }

          // Also remove an extra blank line if this creates one
          if (sourceText[end] === "\n") {
            // Check if previous non-whitespace is also a newline
            let checkPos = start - 1;
            while (checkPos >= 0 && /[ \t]/.test(sourceText[checkPos])) {
              checkPos--;
            }
            if (checkPos >= 0 && sourceText[checkPos] === "\n") {
              // This would create a double blank line, remove one
              end++;
            }
          }

          return fixer.removeRange([start, end]);
        },
      });
    }

    function checkExportAll(node: any) {
      // export * from "..."
      if (!node.source) {
        return;
      }

      const source: string = node.source.value;
      const shortFilename = basename;

      context.report({
        node,
        messageId: "noReexportNamespace",
        data: {
          source,
          filename: shortFilename,
        },
        fix(fixer: any) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const sourceText = sourceCode.text;

          let start = node.range[0];
          let end = node.range[1];

          // Walk back to remove leading whitespace
          while (start > 0 && /[ \t]/.test(sourceText[start - 1])) {
            start--;
          }

          // Remove trailing newline
          if (sourceText[end] === "\n") {
            end++;
          } else if (sourceText[end] === "\r" && sourceText[end + 1] === "\n") {
            end += 2;
          }

          return fixer.removeRange([start, end]);
        },
      });
    }

    return {
      ExportNamedDeclaration: checkExport,
      ExportAllDeclaration: checkExportAll,
    };
  },
};

export default rule;
