/**
 * Disallow explicit /index.ts imports.
 * Import from the directory instead: `./foo` not `./foo/index.ts`
 * Exception: `./index.ts` is allowed, but `"."` should use `"./index.ts"` instead.
 */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow explicit /index.ts imports. Use directory imports instead.",
    },
    fixable: "code",
    messages: {
      noIndexImport:
        'Import from directory instead of index file. Use "{{suggested}}" instead of "{{source}}"',
      useDotIndex: 'Use "./index" or "./index.ts" instead of "." for current directory imports',
    },
  },

  create(context: any) {
    const filename: string = context.filename;

    // Skip node_modules and dist
    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }

    function checkSource(node: any) {
      if (!node.source) return;

      const source: string = node.source.value;

      // Flag "." - should use "./index" or "./index.ts" instead
      if (source === ".") {
        context.report({
          node: node.source,
          messageId: "useDotIndex",
          fix(fixer: any) {
            const raw = node.source.raw;
            const quote = raw[0];
            return fixer.replaceText(node.source, `${quote}./index${quote}`);
          },
        });
        return;
      }

      // Allow ./index.ts (current directory index import)
      if (/^\.\/index(\.tsx?|\.jsx?|\.mts|\.mjs)?$/.test(source)) {
        return;
      }

      // Check for explicit index imports: ./foo/index, ./foo/index.ts, ./foo/index.js, etc.
      const indexMatch = source.match(/^(.+)\/index(\.tsx?|\.jsx?|\.mts|\.mjs)?$/);
      if (indexMatch) {
        const suggested = indexMatch[1];

        context.report({
          node: node.source,
          messageId: "noIndexImport",
          data: { source, suggested },
          fix(fixer: any) {
            // Replace the source string, keeping the quotes
            const raw = node.source.raw;
            const quote = raw[0];
            return fixer.replaceText(node.source, `${quote}${suggested}${quote}`);
          },
        });
      }
    }

    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
    };
  },
};

export default rule;
