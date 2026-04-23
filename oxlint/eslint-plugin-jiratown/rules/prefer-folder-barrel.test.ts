import rule from "./prefer-folder-barrel";

interface Report {
  messageId: string;
  data?: Record<string, string>;
  node: unknown;
}

function createContext(filename: string) {
  const reports: Report[] = [];

  return {
    filename,
    report: (data: Report) => {
      reports.push(data);
    },
    reports,
  };
}

type NodeType =
  | "ExportNamedDeclaration"
  | "ExportAllDeclaration"
  | "VariableDeclaration"
  | "FunctionDeclaration"
  | "ClassDeclaration"
  | "ImportDeclaration";

function parseStatements(
  code: string,
): Array<{ type: NodeType; source?: string; declaration?: boolean }> {
  const statements: Array<{ type: NodeType; source?: string; declaration?: boolean }> = [];

  // Re-exports: export { x } from "./y" or export type { x } from "./y"
  const namedReExport = /export\s+(?:type\s+)?{[^}]*}\s+from\s+["']([^"']+)["']/g;
  let match;
  while ((match = namedReExport.exec(code)) !== null) {
    statements.push({ type: "ExportNamedDeclaration", source: match[1] });
  }

  // Star re-exports: export * from "./x"
  const starReExport = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  while ((match = starReExport.exec(code)) !== null) {
    statements.push({ type: "ExportAllDeclaration", source: match[1] });
  }

  // Inline exports: export const/function/class/type/interface
  if (/export\s+(?:const|let|var)\s+\w+/.test(code)) {
    statements.push({ type: "ExportNamedDeclaration", declaration: true });
  }
  if (/export\s+function\s+\w+/.test(code)) {
    statements.push({ type: "ExportNamedDeclaration", declaration: true });
  }
  if (/export\s+class\s+\w+/.test(code)) {
    statements.push({ type: "ExportNamedDeclaration", declaration: true });
  }

  // Non-exported declarations
  if (/(?<!export\s+)const\s+\w+\s*=/.test(code)) {
    statements.push({ type: "VariableDeclaration" });
  }
  if (/(?<!export\s+)function\s+\w+\s*\(/.test(code)) {
    statements.push({ type: "FunctionDeclaration" });
  }
  if (/(?<!export\s+)class\s+\w+/.test(code)) {
    statements.push({ type: "ClassDeclaration" });
  }

  return statements;
}

function runRule(filename: string, code: string): Report[] {
  const context = createContext(filename);
  const visitor = rule.create(context);
  const statements = parseStatements(code);

  // Call Program
  const programNode = { type: "Program" };
  visitor.Program?.(programNode);

  // Process statements
  for (const stmt of statements) {
    if (stmt.type === "ExportNamedDeclaration") {
      visitor.ExportNamedDeclaration?.({
        source: stmt.source ? { value: stmt.source } : null,
        declaration: stmt.declaration ? {} : null,
      });
    } else if (stmt.type === "ExportAllDeclaration") {
      visitor.ExportAllDeclaration?.({
        source: { value: stmt.source },
      });
    } else if (stmt.type === "VariableDeclaration") {
      visitor.VariableDeclaration?.({});
    } else if (stmt.type === "FunctionDeclaration") {
      visitor.FunctionDeclaration?.({});
    } else if (stmt.type === "ClassDeclaration") {
      visitor.ClassDeclaration?.({});
    }
  }

  // Call Program:exit
  visitor["Program:exit"]?.(programNode);

  return context.reports;
}

describe("prefer-folder-barrel", () => {
  describe("reports barrel-only files with sibling re-exports", () => {
    it("reports file with only sibling named re-exports", () => {
      const code = `
        export { parseSessionMemory } from "./parse.ts";
        export { serializeSessionMemory } from "./serialize.ts";
      `;
      const reports = runRule("/project/src/parser.ts", code);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.messageId).toBe("preferFolderBarrel");
      expect(reports[0]!.data?.filename).toBe("parser.ts");
      expect(reports[0]!.data?.folderName).toBe("parser");
    });

    it("reports file with only sibling star re-exports", () => {
      const code = `
        export * from "./types.ts";
        export * from "./utils.ts";
      `;
      const reports = runRule("/project/src/lib.ts", code);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.folderName).toBe("lib");
    });

    it("reports file with mixed sibling re-export styles", () => {
      const code = `
        export { foo } from "./foo.ts";
        export * from "./bar.ts";
        export type { Baz } from "./baz.ts";
      `;
      const reports = runRule("/project/src/utils.ts", code);
      expect(reports).toHaveLength(1);
    });
  });

  describe("ignores files re-exporting from non-sibling paths", () => {
    it("ignores file re-exporting from parent directory", () => {
      const code = `
        export type { Issue } from "../db/schema/issues.ts";
      `;
      const reports = runRule("/project/src/types/issue.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores file re-exporting from subdirectory", () => {
      const code = `
        export { foo } from "./utils/foo.ts";
        export { bar } from "./utils/bar.ts";
      `;
      const reports = runRule("/project/src/lib.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores file re-exporting from package", () => {
      const code = `
        export { useState } from "react";
      `;
      const reports = runRule("/project/src/hooks.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores mixed sibling and non-sibling re-exports", () => {
      const code = `
        export { foo } from "./foo.ts";
        export type { Bar } from "../types/bar.ts";
      `;
      const reports = runRule("/project/src/lib.ts", code);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores files with real code", () => {
    it("ignores file with re-exports AND inline exports", () => {
      const code = `
        export { foo } from "./foo.ts";
        export const bar = 42;
      `;
      const reports = runRule("/project/src/utils.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores file with re-exports AND local functions", () => {
      const code = `
        export { foo } from "./foo.ts";
        function helper() { return 1; }
      `;
      const reports = runRule("/project/src/utils.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores file with re-exports AND local variables", () => {
      const code = `
        export * from "./types.ts";
        const VERSION = "1.0.0";
      `;
      const reports = runRule("/project/src/lib.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores file with only inline exports (no re-exports)", () => {
      const code = `
        export const foo = 1;
        export function bar() {}
      `;
      const reports = runRule("/project/src/utils.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores file with no exports at all", () => {
      const code = `
        const foo = 1;
        function bar() {}
      `;
      const reports = runRule("/project/src/utils.ts", code);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores index files", () => {
    it("ignores index.ts", () => {
      const code = `
        export { foo } from "./foo.ts";
        export { bar } from "./bar.ts";
      `;
      const reports = runRule("/project/src/index.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores index.tsx", () => {
      const code = `
        export { Component } from "./component.tsx";
      `;
      const reports = runRule("/project/src/index.tsx", code);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores excluded paths", () => {
    it("ignores node_modules", () => {
      const code = `export { foo } from "./foo.ts";`;
      const reports = runRule("/node_modules/pkg/lib.ts", code);
      expect(reports).toHaveLength(0);
    });

    it("ignores dist", () => {
      const code = `export { foo } from "./foo.ts";`;
      const reports = runRule("/dist/lib.ts", code);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores non-TypeScript files", () => {
    it("ignores .js files", () => {
      const code = `export { foo } from "./foo.js";`;
      const reports = runRule("/project/src/lib.js", code);
      expect(reports).toHaveLength(0);
    });
  });
});
