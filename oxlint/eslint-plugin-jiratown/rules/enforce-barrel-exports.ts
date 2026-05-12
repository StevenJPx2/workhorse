import path from "node:path";

/**
 * Enforce barrel export conventions:
 * - If an index.ts exports from other index files (re-exporting barrels), use `export *`
 * - Leaf index files (exporting from non-index files only) can be selective
 */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce that index files re-exporting other barrels use `export *` instead of selective exports",
    },
    messages: {
      useExportStar:
        'Use `export * from "{{source}}"` when re-exporting from another barrel (index file)',
    },
  },

  create(context: any) {
    const filename: string = context.filename;
    const basename = path.basename(filename);

    // Only applies to index files
    if (basename !== "index.ts" && basename !== "index.tsx") {
      return {};
    }

    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }

    return {
      ExportNamedDeclaration(node: any) {
        if (!node.source) return; // Not a re-export

        const source: string = node.source.value;

        // Check if exporting from an index file (barrel)
        if (isBarrelImport(source)) {
          context.report({
            node,
            messageId: "useExportStar",
            data: { source },
          });
        }
      },
    };
  },
};

/**
 * Determines if an import source points to a barrel (index file).
 */
function isBarrelImport(source: string): boolean {
  // Explicit index imports: ./foo/index, ./foo/index.ts
  if (/\/index(\.tsx?|\.jsx?)?$/.test(source)) {
    return true;
  }

  // Directory import with trailing slash
  if (source.endsWith("/")) {
    return true;
  }

  return false;
}

export default rule;
