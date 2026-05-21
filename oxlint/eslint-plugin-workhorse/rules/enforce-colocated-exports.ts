import fs from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const rule = {
  meta: {
    docs: {
      description:
        "Enforce colocated folder structure. Folders with multiple source files must have an index.ts for re-exports.",
    },
  },

  create(context) {
    const filename = context.filename;
    const dirname = path.dirname(filename);

    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }

    const basename = path.basename(filename);

    if (basename !== "index.ts" && basename !== "index.tsx") {
      return {};
    }

    try {
      const entries = fs.readdirSync(dirname);
      const sourceFiles = entries.filter(
        (e) =>
          SOURCE_EXTENSIONS.has(path.extname(e)) &&
          !e.endsWith(".test.ts") &&
          !e.endsWith(".test.tsx"),
      );

      const hasIndex =
        entries.includes("index.ts") || entries.includes("index.tsx");

      if (sourceFiles.length > 1 && !hasIndex) {
        context.report({
          loc: { line: 1, column: 0 },
          message: `Folder "${path.basename(dirname)}" has ${sourceFiles.length} source files but no index.ts. Add an index.ts for colocated exports.`,
        });
      }
    } catch {
      // Directory may not be accessible during linting
    }

    return {};
  },
};

export default rule;
