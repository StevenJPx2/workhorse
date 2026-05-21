/**
 * Detect files with multiple independent exports that should be split into a directory.
 *
 * When a file like `implementations.ts` has multiple large, independent exports:
 * ```ts
 * export const fooImpl = async () => { ... };  // 40 lines
 * export const barImpl = async () => { ... };  // 35 lines
 * export const bazImpl = async () => { ... };  // 45 lines
 * ```
 *
 * It should be refactored to a folder structure:
 * ```
 * implementations/
 * ├── index.ts      # barrel re-exports
 * ├── foo.ts        # export const fooImpl
 * ├── bar.ts        # export const barImpl
 * └── baz.ts        # export const bazImpl
 * ```
 *
 * Conditions for flagging:
 * - File has 3+ exported CODE declarations (functions, classes, consts - NOT types/interfaces)
 * - File exceeds line threshold (default: 150 lines)
 * - Exports have substantial average size (default: 20 lines each)
 *
 * NOT flagged:
 * - Files that only export types/interfaces (types.ts files)
 * - Test files
 * - Index/barrel files
 */
import { isIndexFile, parseFileContext, shouldSkipFile } from "./utils.ts";

interface ExportInfo {
  name: string;
  startLine: number;
  endLine: number;
  kind: "function" | "class" | "const" | "type" | "interface";
  node: unknown;
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest splitting files with multiple independent exports into a directory structure",
    },
    schema: [
      {
        type: "object",
        properties: {
          minExports: {
            type: "number",
            default: 4,
            description: "Minimum number of code exports to trigger the rule",
          },
          minLines: {
            type: "number",
            default: 180,
            description: "Minimum file lines to trigger the rule",
          },
          minAvgExportLines: {
            type: "number",
            default: 30,
            description: "Minimum average lines per code export to trigger",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferExportDirectory:
        'File "{{filename}}" has {{exportCount}} independent exports across {{lineCount}} lines. Consider splitting into {{folderName}}/ directory with separate files for each export.',
    },
  },

  create(context: any) {
    const options = context.options?.[0] ?? {};
    const minExports = options.minExports ?? 4;
    const minLines = options.minLines ?? 180;
    const minAvgExportLines = options.minAvgExportLines ?? 30;

    const ctx = parseFileContext(context.filename);

    // Skip index files, test files, and excluded paths
    if (isIndexFile(ctx) || shouldSkipFile(ctx)) {
      return {};
    }

    // Skip test files
    if (ctx.filename.includes(".test.") || ctx.filename.includes("__tests__")) {
      return {};
    }

    const exports: ExportInfo[] = [];
    let programNode: any = null;

    function getExportName(node: any): string | null {
      // Handle: export const foo = ...
      if (node.declaration?.declarations?.[0]?.id?.name) {
        return node.declaration.declarations[0].id.name;
      }
      // Handle: export function foo() {}
      if (node.declaration?.id?.name) {
        return node.declaration.id.name;
      }
      // Handle: export class Foo {}
      if (node.declaration?.id?.name) {
        return node.declaration.id.name;
      }
      return null;
    }

    function getExportKind(node: any): ExportInfo["kind"] | null {
      if (!node.declaration) return null;

      const declType = node.declaration.type;
      if (declType === "FunctionDeclaration") return "function";
      if (declType === "ClassDeclaration") return "class";
      if (declType === "TSTypeAliasDeclaration") return "type";
      if (declType === "TSInterfaceDeclaration") return "interface";
      if (declType === "VariableDeclaration") return "const";
      return null;
    }

    function getNodeLines(node: any): { start: number; end: number } {
      return {
        start: node.loc?.start?.line ?? 0,
        end: node.loc?.end?.line ?? 0,
      };
    }

    return {
      Program(node: any) {
        programNode = node;
      },

      ExportNamedDeclaration(node: any) {
        // Skip re-exports (export { x } from "y")
        if (node.source) return;

        // Skip export specifiers without declaration (export { x })
        if (!node.declaration) return;

        const name = getExportName(node);
        const kind = getExportKind(node);

        if (name && kind) {
          const lines = getNodeLines(node);
          exports.push({
            name,
            startLine: lines.start,
            endLine: lines.end,
            kind,
            node,
          });
        }
      },

      // Also catch: export default function foo() {}
      ExportDefaultDeclaration(node: any) {
        if (node.declaration?.id?.name) {
          const lines = getNodeLines(node);
          exports.push({
            name: node.declaration.id.name,
            startLine: lines.start,
            endLine: lines.end,
            kind:
              node.declaration.type === "FunctionDeclaration"
                ? "function"
                : "class",
            node,
          });
        }
      },

      "Program:exit"() {
        // Only count CODE exports (functions, classes, consts) - not types/interfaces
        const codeExports = exports.filter(
          (exp) =>
            exp.kind === "function" ||
            exp.kind === "class" ||
            exp.kind === "const",
        );

        // Check if we meet thresholds for code exports
        if (codeExports.length < minExports) return;

        const sourceCode = context.sourceCode;
        const lineCount = sourceCode?.lines?.length ?? 0;

        if (lineCount < minLines) return;

        // Calculate average lines per code export
        const totalExportLines = codeExports.reduce(
          (sum, exp) => sum + (exp.endLine - exp.startLine + 1),
          0,
        );
        const avgExportLines = totalExportLines / codeExports.length;

        if (avgExportLines < minAvgExportLines) return;

        // All conditions met - report
        context.report({
          node: programNode,
          messageId: "preferExportDirectory",
          data: {
            filename: ctx.basename,
            exportCount: String(codeExports.length),
            lineCount: String(lineCount),
            folderName: ctx.nameWithoutExt,
          },
        });
      },
    };
  },
};

export default rule;
