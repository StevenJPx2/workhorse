import rule from "./prefer-export-directory";

interface Report {
  messageId: string;
  data?: Record<string, string>;
  node: unknown;
}

function createContext(filename: string, lineCount: number, options?: object[]) {
  const reports: Report[] = [];

  return {
    filename,
    options,
    sourceCode: {
      lines: Array(lineCount).fill(""),
    },
    report: (data: Report) => {
      reports.push(data);
    },
    reports,
  };
}

interface MockExport {
  name: string;
  kind: "function" | "class" | "const" | "type" | "interface";
  startLine: number;
  endLine: number;
  isDefault?: boolean;
}

function runRule(
  filename: string,
  lineCount: number,
  exports: MockExport[],
  options?: object[],
): Report[] {
  const context = createContext(filename, lineCount, options);
  const visitor = rule.create(context);

  // Call Program
  const programNode = { type: "Program" };
  visitor.Program?.(programNode);

  // Process exports
  for (const exp of exports) {
    const loc = {
      start: { line: exp.startLine },
      end: { line: exp.endLine },
    };

    if (exp.isDefault) {
      visitor.ExportDefaultDeclaration?.({
        loc,
        declaration: {
          type: exp.kind === "function" ? "FunctionDeclaration" : "ClassDeclaration",
          id: { name: exp.name },
        },
      });
    } else {
      const declType = {
        function: "FunctionDeclaration",
        class: "ClassDeclaration",
        const: "VariableDeclaration",
        type: "TSTypeAliasDeclaration",
        interface: "TSInterfaceDeclaration",
      }[exp.kind];

      const declaration: any = { type: declType };

      if (exp.kind === "const") {
        declaration.declarations = [{ id: { name: exp.name } }];
      } else {
        declaration.id = { name: exp.name };
      }

      visitor.ExportNamedDeclaration?.({
        loc,
        source: null,
        declaration,
      });
    }
  }

  // Call Program:exit
  visitor["Program:exit"]?.();

  return context.reports;
}

describe("prefer-export-directory", () => {
  // Default thresholds: minExports=4, minLines=180, minAvgExportLines=30
  describe("reports files meeting all thresholds", () => {
    it("reports file with 4+ large exports exceeding line threshold", () => {
      const exports: MockExport[] = [
        { name: "fooImpl", kind: "const", startLine: 1, endLine: 50 },
        { name: "barImpl", kind: "const", startLine: 52, endLine: 100 },
        { name: "bazImpl", kind: "const", startLine: 102, endLine: 150 },
        { name: "quxImpl", kind: "const", startLine: 152, endLine: 200 },
      ];

      const reports = runRule("/project/src/implementations.ts", 200, exports);

      expect(reports).toHaveLength(1);
      expect(reports[0]!.messageId).toBe("preferExportDirectory");
      expect(reports[0]!.data?.filename).toBe("implementations.ts");
      expect(reports[0]!.data?.folderName).toBe("implementations");
      expect(reports[0]!.data?.exportCount).toBe("4");
    });

    it("reports file with exported functions", () => {
      const exports: MockExport[] = [
        { name: "parseConfig", kind: "function", startLine: 1, endLine: 50 },
        { name: "validateConfig", kind: "function", startLine: 52, endLine: 100 },
        { name: "serializeConfig", kind: "function", startLine: 102, endLine: 150 },
        { name: "loadConfig", kind: "function", startLine: 152, endLine: 200 },
      ];

      const reports = runRule("/project/src/config-utils.ts", 200, exports);

      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.exportCount).toBe("4");
    });

    it("reports file with mixed export kinds", () => {
      const exports: MockExport[] = [
        { name: "MyClass", kind: "class", startLine: 1, endLine: 60 },
        { name: "myFunction", kind: "function", startLine: 62, endLine: 110 },
        { name: "myConst", kind: "const", startLine: 112, endLine: 160 },
        { name: "anotherFunc", kind: "function", startLine: 162, endLine: 200 },
      ];

      const reports = runRule("/project/src/utils.ts", 200, exports);

      expect(reports).toHaveLength(1);
    });

    it("reports file with many exports", () => {
      const exports: MockExport[] = [
        { name: "tool1", kind: "const", startLine: 1, endLine: 50 },
        { name: "tool2", kind: "const", startLine: 52, endLine: 100 },
        { name: "tool3", kind: "const", startLine: 102, endLine: 150 },
        { name: "tool4", kind: "const", startLine: 152, endLine: 200 },
        { name: "tool5", kind: "const", startLine: 202, endLine: 250 },
      ];

      const reports = runRule("/project/src/tools.ts", 250, exports);

      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.exportCount).toBe("5");
    });
  });

  describe("respects custom options", () => {
    it("uses custom minExports threshold", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 50 },
        { name: "bar", kind: "function", startLine: 52, endLine: 100 },
        { name: "baz", kind: "function", startLine: 102, endLine: 150 },
      ];

      // With default (4), 3 exports should not report
      const reports1 = runRule("/project/src/utils.ts", 200, exports);
      expect(reports1).toHaveLength(0);

      // With minExports: 3, should report (avg 50 lines > 30)
      const reports2 = runRule("/project/src/utils.ts", 200, exports, [{ minExports: 3 }]);
      expect(reports2).toHaveLength(1);
    });

    it("uses custom minLines threshold", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 40 },
        { name: "bar", kind: "function", startLine: 42, endLine: 80 },
        { name: "baz", kind: "function", startLine: 82, endLine: 120 },
        { name: "qux", kind: "function", startLine: 122, endLine: 160 },
      ];

      // With 160 lines and default minLines (180), should not report
      const reports1 = runRule("/project/src/utils.ts", 160, exports);
      expect(reports1).toHaveLength(0);

      // With minLines: 150, should report
      const reports2 = runRule("/project/src/utils.ts", 160, exports, [{ minLines: 150 }]);
      expect(reports2).toHaveLength(1);
    });

    it("uses custom minAvgExportLines threshold", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 25 },
        { name: "bar", kind: "function", startLine: 27, endLine: 50 },
        { name: "baz", kind: "function", startLine: 52, endLine: 75 },
        { name: "qux", kind: "function", startLine: 77, endLine: 100 },
      ];

      // Avg is ~25 lines, default minAvgExportLines is 30, should not report
      const reports1 = runRule("/project/src/utils.ts", 200, exports);
      expect(reports1).toHaveLength(0);

      // With minAvgExportLines: 20, should report
      const reports2 = runRule("/project/src/utils.ts", 200, exports, [{ minAvgExportLines: 20 }]);
      expect(reports2).toHaveLength(1);
    });
  });

  describe("ignores files not meeting thresholds", () => {
    it("ignores file with fewer than minExports", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 50 },
        { name: "bar", kind: "function", startLine: 52, endLine: 100 },
      ];

      const reports = runRule("/project/src/utils.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores file under line threshold", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 30 },
        { name: "bar", kind: "function", startLine: 32, endLine: 60 },
        { name: "baz", kind: "function", startLine: 62, endLine: 90 },
      ];

      const reports = runRule("/project/src/utils.ts", 90, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores file with small average export size", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "const", startLine: 1, endLine: 5 },
        { name: "bar", kind: "const", startLine: 7, endLine: 12 },
        { name: "baz", kind: "const", startLine: 14, endLine: 20 },
        { name: "qux", kind: "const", startLine: 22, endLine: 28 },
      ];

      // Many small exports in a large file - likely just constants, not worth splitting
      const reports = runRule("/project/src/constants.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores special files", () => {
    it("ignores index.ts files", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 50 },
        { name: "bar", kind: "function", startLine: 52, endLine: 100 },
        { name: "baz", kind: "function", startLine: 102, endLine: 150 },
      ];

      const reports = runRule("/project/src/index.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores test files", () => {
      const exports: MockExport[] = [
        { name: "testHelper1", kind: "function", startLine: 1, endLine: 50 },
        { name: "testHelper2", kind: "function", startLine: 52, endLine: 100 },
        { name: "testHelper3", kind: "function", startLine: 102, endLine: 150 },
      ];

      const reports = runRule("/project/src/utils.test.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores __tests__ directory", () => {
      const exports: MockExport[] = [
        { name: "mock1", kind: "const", startLine: 1, endLine: 50 },
        { name: "mock2", kind: "const", startLine: 52, endLine: 100 },
        { name: "mock3", kind: "const", startLine: 102, endLine: 150 },
      ];

      const reports = runRule("/project/src/__tests__/mocks.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores node_modules", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 50 },
        { name: "bar", kind: "function", startLine: 52, endLine: 100 },
        { name: "baz", kind: "function", startLine: 102, endLine: 150 },
      ];

      const reports = runRule("/node_modules/pkg/utils.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores dist directory", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 50 },
        { name: "bar", kind: "function", startLine: 52, endLine: 100 },
        { name: "baz", kind: "function", startLine: 102, endLine: 150 },
      ];

      const reports = runRule("/dist/utils.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("ignores non-TypeScript files", () => {
      const exports: MockExport[] = [
        { name: "foo", kind: "function", startLine: 1, endLine: 50 },
        { name: "bar", kind: "function", startLine: 52, endLine: 100 },
        { name: "baz", kind: "function", startLine: 102, endLine: 150 },
      ];

      const reports = runRule("/project/src/utils.js", 200, exports);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores re-exports", () => {
    it("does not count re-exports toward threshold", () => {
      // This simulates a file that is mostly re-exports
      // The rule should only count actual declarations
      const context = createContext("/project/src/barrel.ts", 200);
      const visitor = rule.create(context);

      visitor.Program?.({ type: "Program" });

      // Add re-exports (should be ignored)
      visitor.ExportNamedDeclaration?.({
        source: { value: "./foo.ts" },
        specifiers: [{ exported: { name: "foo" } }],
      });
      visitor.ExportNamedDeclaration?.({
        source: { value: "./bar.ts" },
        specifiers: [{ exported: { name: "bar" } }],
      });
      visitor.ExportNamedDeclaration?.({
        source: { value: "./baz.ts" },
        specifiers: [{ exported: { name: "baz" } }],
      });

      visitor["Program:exit"]?.();

      expect(context.reports).toHaveLength(0);
    });
  });

  describe("handles types and interfaces", () => {
    it("ignores files with only type/interface exports", () => {
      const exports: MockExport[] = [
        { name: "FooType", kind: "type", startLine: 1, endLine: 40 },
        { name: "BarInterface", kind: "interface", startLine: 42, endLine: 80 },
        { name: "BazType", kind: "type", startLine: 82, endLine: 120 },
        { name: "QuxInterface", kind: "interface", startLine: 122, endLine: 160 },
      ];

      // Types-only file should NOT be flagged
      const reports = runRule("/project/src/types.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("only counts code exports, not types", () => {
      const exports: MockExport[] = [
        { name: "FooType", kind: "type", startLine: 1, endLine: 20 },
        { name: "BarInterface", kind: "interface", startLine: 22, endLine: 40 },
        { name: "helper1", kind: "function", startLine: 42, endLine: 80 },
        { name: "helper2", kind: "function", startLine: 82, endLine: 120 },
      ];

      // Only 2 code exports (functions), so should not be flagged (minExports=3)
      const reports = runRule("/project/src/utils.ts", 200, exports);
      expect(reports).toHaveLength(0);
    });

    it("flags files with enough code exports mixed with types", () => {
      const exports: MockExport[] = [
        { name: "FooType", kind: "type", startLine: 1, endLine: 10 },
        { name: "helper1", kind: "function", startLine: 12, endLine: 60 },
        { name: "helper2", kind: "function", startLine: 62, endLine: 120 },
        { name: "helper3", kind: "function", startLine: 122, endLine: 180 },
        { name: "helper4", kind: "function", startLine: 182, endLine: 240 },
      ];

      // 4 code exports (functions), each ~50 lines, should be flagged with defaults
      const reports = runRule("/project/src/utils.ts", 240, exports);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.exportCount).toBe("4"); // Only counts functions, not type
    });
  });

  describe("handles default exports", () => {
    it("counts default exported functions", () => {
      const exports: MockExport[] = [
        { name: "mainFunction", kind: "function", startLine: 1, endLine: 50, isDefault: true },
        { name: "helper1", kind: "function", startLine: 52, endLine: 100 },
        { name: "helper2", kind: "function", startLine: 102, endLine: 150 },
        { name: "helper3", kind: "function", startLine: 152, endLine: 200 },
      ];

      const reports = runRule("/project/src/module.ts", 200, exports);

      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.exportCount).toBe("4");
    });
  });
});
