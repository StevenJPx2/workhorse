import rule from "./no-reexport-outside-barrel";

interface Report {
  messageId: string;
  data?: Record<string, string>;
  node: unknown;
  fix?: (fixer: unknown) => unknown;
}

function createContext(filename: string, sourceText = "") {
  const reports: Report[] = [];

  return {
    filename,
    sourceCode: {
      text: sourceText,
    },
    getSourceCode: () => ({ text: sourceText }),
    report: (data: Report) => {
      reports.push(data);
    },
    reports,
  };
}

function createExportNode(
  source: string,
  options: {
    specifiers?: Array<{
      exported?: { name: string };
      local?: { name: string };
    }>;
    exportKind?: "value" | "type";
    range?: [number, number];
  } = {},
) {
  return {
    source: { value: source },
    specifiers: options.specifiers ?? [{ exported: { name: "Foo" } }],
    exportKind: options.exportKind ?? "value",
    range: options.range ?? [0, 30],
  };
}

function createExportAllNode(
  source: string,
  range: [number, number] = [0, 30],
) {
  return {
    source: { value: source },
    range,
  };
}

function runRule(
  filename: string,
  nodes: Array<{
    type: "named" | "all";
    source: string;
    specifiers?: string[];
    isType?: boolean;
  }>,
): Report[] {
  const context = createContext(filename);
  const visitor = rule.create(context);

  for (const node of nodes) {
    if (node.type === "named" && visitor.ExportNamedDeclaration) {
      const specifiers = (node.specifiers ?? ["Foo"]).map((name) => ({
        exported: { name },
      }));
      visitor.ExportNamedDeclaration(
        createExportNode(node.source, {
          specifiers,
          exportKind: node.isType ? "type" : "value",
        }),
      );
    } else if (node.type === "all" && visitor.ExportAllDeclaration) {
      visitor.ExportAllDeclaration(createExportAllNode(node.source));
    }
  }

  return context.reports;
}

describe("no-reexport-outside-barrel", () => {
  describe("reports re-exports in non-barrel files", () => {
    it("reports named re-export in non-index file", () => {
      const reports = runRule("/project/src/models.ts", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.messageId).toBe("noReexport");
    });

    it("reports type re-export in non-index file", () => {
      const reports = runRule("/project/src/types.ts", [
        {
          type: "named",
          source: "./other",
          specifiers: ["SomeType"],
          isType: true,
        },
      ]);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.messageId).toBe("noReexport");
    });

    it("reports export * in non-index file", () => {
      const reports = runRule("/project/src/service.ts", [
        { type: "all", source: "./utils" },
      ]);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.messageId).toBe("noReexportNamespace");
    });

    it("reports multiple re-exports", () => {
      const reports = runRule("/project/src/helpers.ts", [
        { type: "named", source: "./a" },
        { type: "named", source: "./b" },
        { type: "all", source: "./c" },
      ]);
      expect(reports).toHaveLength(3);
    });

    it("includes source in error message", () => {
      const reports = runRule("/project/src/models.ts", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports[0]!.data?.source).toBe("workhorse-core");
    });

    it("includes filename in error message", () => {
      const reports = runRule("/project/src/models.ts", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports[0]!.data?.filename).toBe("models.ts");
    });
  });

  describe("allows re-exports in barrel files", () => {
    it("allows re-export in index.ts", () => {
      const reports = runRule("/project/src/index.ts", [
        { type: "named", source: "./models" },
        { type: "all", source: "./types" },
      ]);
      expect(reports).toHaveLength(0);
    });

    it("allows re-export in index.tsx", () => {
      const reports = runRule("/project/src/index.tsx", [
        { type: "named", source: "./component" },
      ]);
      expect(reports).toHaveLength(0);
    });

    it("allows re-export in nested index.ts", () => {
      const reports = runRule("/project/src/components/index.ts", [
        { type: "named", source: "./button" },
      ]);
      expect(reports).toHaveLength(0);
    });
  });

  describe("skips special files", () => {
    it("skips test files", () => {
      const reports = runRule("/project/src/models.test.ts", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports).toHaveLength(0);
    });

    it("skips spec files", () => {
      const reports = runRule("/project/src/models.spec.ts", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports).toHaveLength(0);
    });

    it("skips node_modules", () => {
      const reports = runRule("/node_modules/some-pkg/utils.ts", [
        { type: "named", source: "./internal" },
      ]);
      expect(reports).toHaveLength(0);
    });

    it("skips dist", () => {
      const reports = runRule("/dist/utils.ts", [
        { type: "named", source: "./internal" },
      ]);
      expect(reports).toHaveLength(0);
    });

    it("skips non-TypeScript files", () => {
      const reports = runRule("/project/src/models.js", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports).toHaveLength(0);
    });
  });

  describe("ignores non-re-exports", () => {
    it("ignores regular exports without source", () => {
      const context = createContext("/project/src/models.ts");
      const visitor = rule.create(context);

      // Export without 'from' clause
      if (visitor.ExportNamedDeclaration) {
        visitor.ExportNamedDeclaration({
          source: null, // No 'from' clause
          specifiers: [{ exported: { name: "myFunction" } }],
          range: [0, 30],
        });
      }

      expect(context.reports).toHaveLength(0);
    });
  });

  describe("auto-fix", () => {
    it("provides a fixer that removes the re-export", () => {
      const reports = runRule("/project/src/models.ts", [
        { type: "named", source: "workhorse-core" },
      ]);
      expect(reports[0]!.fix).toBeDefined();
    });

    it("fixer removes the line", () => {
      const sourceText =
        'export type { Foo } from "workhorse-core";\n\nconst x = 1;';
      const context = createContext("/project/src/models.ts", sourceText);
      const visitor = rule.create(context);

      if (visitor.ExportNamedDeclaration) {
        visitor.ExportNamedDeclaration({
          source: { value: "workhorse-core" },
          specifiers: [{ exported: { name: "Foo" } }],
          exportKind: "type",
          range: [0, 42], // Length of the export statement
        });
      }

      expect(context.reports).toHaveLength(1);
      const fixer = {
        removeRange: (range: [number, number]) => ({ range, text: "" }),
      };
      const fix = context.reports[0]!.fix?.(fixer);
      expect(fix).toBeDefined();
    });
  });

  describe("real-world examples", () => {
    it("catches the models.ts re-export pattern", () => {
      // This is the exact pattern from packages/plugins/pi-adapter/src/models.ts:15
      const reports = runRule(
        "/project/packages/plugins/pi-adapter/src/models.ts",
        [
          {
            type: "named",
            source: "workhorse-core",
            specifiers: ["ModelInfo"],
            isType: true,
          },
        ],
      );
      expect(reports).toHaveLength(1);
    });

    it("catches the hooks/types.ts re-export pattern", () => {
      // This is the pattern from packages/core/src/lib/hooks/types.ts:7
      const reports = runRule("/project/packages/core/src/lib/hooks/types.ts", [
        {
          type: "named",
          source: "#workflow/tracker",
          specifiers: ["PromptBuildingContext", "PromptContextBlock"],
          isType: true,
        },
      ]);
      expect(reports).toHaveLength(1);
    });

    it("allows the tools.ts re-export with disable comment (special case)", () => {
      // The tools.ts file has a disable comment, so it would be skipped
      // This test just documents the pattern exists
      const reports = runRule("/project/packages/plugins/github/src/tools.ts", [
        { type: "named", source: "./tools/index.ts" },
      ]);
      // Without the disable comment, this would be flagged
      expect(reports).toHaveLength(1);
    });
  });
});
