import rule from "./enforce-barrel-exports";

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

function parseExports(code: string): Array<{ type: string; source?: string }> {
  // Simple parser for export statements
  const exports: Array<{ type: string; source?: string }> = [];
  const namedExportMatch = /export\s+(?:type\s+)?{[^}]*}\s+from\s+["']([^"']+)["']/g;
  const starExportMatch = /export\s+\*\s+from\s+["']([^"']+)["']/g;

  let match;
  while ((match = namedExportMatch.exec(code)) !== null) {
    exports.push({ type: "ExportNamedDeclaration", source: match[1] });
  }
  while ((match = starExportMatch.exec(code)) !== null) {
    exports.push({ type: "ExportAllDeclaration", source: match[1] });
  }

  return exports;
}

function runRule(filename: string, code: string): Report[] {
  const context = createContext(filename);
  const visitor = rule.create(context);
  const exports = parseExports(code);

  for (const exp of exports) {
    if (exp.type === "ExportNamedDeclaration" && visitor.ExportNamedDeclaration) {
      visitor.ExportNamedDeclaration({
        source: exp.source ? { value: exp.source } : null,
      });
    }
  }

  return context.reports;
}

describe("enforce-barrel-exports", () => {
  it("allows selective exports from non-index files", () => {
    const reports = runRule("/project/src/index.ts", `export { foo } from "./foo.ts";`);
    expect(reports).toHaveLength(0);
  });

  it("allows selective exports from files with extensions", () => {
    const reports = runRule("/project/src/index.ts", `export type { Bar } from "./bar.ts";`);
    expect(reports).toHaveLength(0);
  });

  it("reports when re-exporting from explicit index.ts", () => {
    const reports = runRule("/project/src/index.ts", `export { foo } from "./config/index.ts";`);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.messageId).toBe("useExportStar");
  });

  it("reports when re-exporting from index without extension", () => {
    const reports = runRule("/project/src/index.ts", `export type { Bar } from "./types/index";`);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.messageId).toBe("useExportStar");
  });

  it("reports when re-exporting from directory with trailing slash", () => {
    const reports = runRule("/project/src/index.ts", `export { a } from "./lib/";`);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.messageId).toBe("useExportStar");
  });

  it("allows export * from barrels", () => {
    const reports = runRule("/project/src/index.ts", `export * from "./config/index.ts";`);
    expect(reports).toHaveLength(0);
  });

  it("ignores non-index files", () => {
    const reports = runRule("/project/src/utils.ts", `export { foo } from "./other/index.ts";`);
    expect(reports).toHaveLength(0);
  });

  it("ignores node_modules", () => {
    const reports = runRule("/node_modules/foo/index.ts", `export { a } from "./bar/index.ts";`);
    expect(reports).toHaveLength(0);
  });

  it("ignores dist", () => {
    const reports = runRule("/dist/index.ts", `export { a } from "./bar/index.ts";`);
    expect(reports).toHaveLength(0);
  });

  it.fails("TODO: implement depth limit for barrel exports", () => {
    // This test documents planned behavior that is not yet implemented.
    // The rule should support a maxDepth option to prevent deeply nested barrel chains.
    // For example: src/index.ts -> utils/index.ts -> helpers/index.ts -> math/index.ts
    // With maxDepth: 2, this 4-level chain should be flagged.

    // Expected: rule should track barrel depth and report when exceeded
    const reports = runRule(
      "/project/src/index.ts",
      `export * from "./utils/index.ts";`, // Would need to trace this chain
    );
    // Currently, the rule doesn't track barrel export depth
    expect(reports.some((r) => r.messageId === "maxDepthExceeded")).toBe(true);
  });
});
