import { describe, it, expect } from "vitest";

import rule from "./no-index-imports";

interface Report {
  node: unknown;
  messageId: string;
  data?: Record<string, string>;
  fix?: (fixer: {
    replaceText: (node: unknown, text: string) => string;
  }) => string;
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

function parseImportsAndExports(code: string): Array<{
  type: "ImportDeclaration" | "ExportNamedDeclaration" | "ExportAllDeclaration";
  source: { value: string; raw: string };
}> {
  const result: Array<{
    type:
      | "ImportDeclaration"
      | "ExportNamedDeclaration"
      | "ExportAllDeclaration";
    source: { value: string; raw: string };
  }> = [];

  // Match import statements
  const importMatch =
    /import\s+(?:type\s+)?(?:{[^}]*}|[\w*]+(?:\s+as\s+\w+)?|\*\s+as\s+\w+)\s+from\s+(["'])([^"']+)\1/g;
  let match;
  while ((match = importMatch.exec(code)) !== null) {
    const quote = match[1];
    const value = match[2];
    result.push({
      type: "ImportDeclaration",
      source: { value, raw: `${quote}${value}${quote}` },
    });
  }

  // Match named exports
  const namedExportMatch =
    /export\s+(?:type\s+)?{[^}]*}\s+from\s+(["'])([^"']+)\1/g;
  while ((match = namedExportMatch.exec(code)) !== null) {
    const quote = match[1];
    const value = match[2];
    result.push({
      type: "ExportNamedDeclaration",
      source: { value, raw: `${quote}${value}${quote}` },
    });
  }

  // Match star exports
  const starExportMatch = /export\s+\*\s+from\s+(["'])([^"']+)\1/g;
  while ((match = starExportMatch.exec(code)) !== null) {
    const quote = match[1];
    const value = match[2];
    result.push({
      type: "ExportAllDeclaration",
      source: { value, raw: `${quote}${value}${quote}` },
    });
  }

  return result;
}

function runRule(filename: string, code: string): Report[] {
  const context = createContext(filename);
  const visitor = rule.create(context);
  const statements = parseImportsAndExports(code);

  for (const stmt of statements) {
    const handler = visitor[stmt.type];
    if (handler) {
      handler({ source: stmt.source });
    }
  }

  return context.reports;
}

function getFix(filename: string, code: string): string | null {
  const reports = runRule(filename, code);
  if (reports.length === 0) return null;

  const report = reports[0];
  if (!report?.fix) return null;

  // Simulate the fixer
  const statements = parseImportsAndExports(code);
  if (statements.length === 0) return null;

  const source = statements[0]!.source;
  const fixResult = report.fix({
    replaceText: (_node: unknown, text: string) => text,
  });

  // Replace the source in the original code
  return code.replace(source.raw, fixResult);
}

describe("no-index-imports", () => {
  describe("valid cases", () => {
    it("allows directory imports without /index", () => {
      expect(
        runRule("/project/src/foo.ts", `import { bar } from "./utils";`).length,
      ).toBe(0);
    });

    it("allows relative imports to files", () => {
      expect(
        runRule(
          "/project/src/foo.ts",
          `import { bar } from "./utils/helper.ts";`,
        ).length,
      ).toBe(0);
    });

    it("allows package imports", () => {
      expect(
        runRule("/project/src/foo.ts", `import React from "react";`).length,
      ).toBe(0);
    });

    it("allows scoped package imports", () => {
      expect(
        runRule("/project/src/foo.ts", `import { z } from "zod/v4";`).length,
      ).toBe(0);
    });

    it("allows hash imports", () => {
      expect(
        runRule("/project/src/foo.ts", `import { config } from "#config";`)
          .length,
      ).toBe(0);
    });

    it("allows ./index.ts (current directory index)", () => {
      expect(
        runRule(
          "/project/src/utils/helper.ts",
          `import { foo } from "./index.ts";`,
        ).length,
      ).toBe(0);
    });

    it("allows ./index (current directory index without extension)", () => {
      expect(
        runRule(
          "/project/src/utils/helper.ts",
          `import { foo } from "./index";`,
        ).length,
      ).toBe(0);
    });

    it("allows ../index.ts (parent directory index)", () => {
      expect(
        runRule(
          "/project/src/utils/helper.ts",
          `import { foo } from "../index.ts";`,
        ).length,
      ).toBe(0);
    });

    it("allows ../../index.ts (grandparent directory index)", () => {
      expect(
        runRule(
          "/project/src/utils/deep/helper.ts",
          `import { foo } from "../../index.ts";`,
        ).length,
      ).toBe(0);
    });

    it("allows ../index (parent directory index without extension)", () => {
      expect(
        runRule(
          "/project/src/utils/helper.ts",
          `import { foo } from "../index";`,
        ).length,
      ).toBe(0);
    });

    it("skips '.' in node_modules", () => {
      expect(
        runRule("/project/node_modules/pkg/foo.ts", `import { a } from ".";`)
          .length,
      ).toBe(0);
    });

    it("skips node_modules", () => {
      expect(
        runRule(
          "/project/node_modules/pkg/index.ts",
          `import { a } from "./foo/index.ts";`,
        ).length,
      ).toBe(0);
    });

    it("skips dist", () => {
      expect(
        runRule("/project/dist/index.ts", `import { a } from "./foo/index.ts";`)
          .length,
      ).toBe(0);
    });
  });

  describe("invalid cases", () => {
    it("reports /index.ts imports", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `import { bar } from "./utils/index.ts";`,
      );
      expect(reports.length).toBe(1);
      expect(reports[0]!.messageId).toBe("noIndexImport");
      expect(reports[0]!.data?.suggested).toBe("./utils");
    });

    it("reports /index imports without extension", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `import { bar } from "./utils/index";`,
      );
      expect(reports.length).toBe(1);
      expect(reports[0]!.data?.suggested).toBe("./utils");
    });

    it("reports /index.js imports", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `import { bar } from "./utils/index.js";`,
      );
      expect(reports.length).toBe(1);
    });

    it("reports /index.tsx imports", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `import { bar } from "./components/index.tsx";`,
      );
      expect(reports.length).toBe(1);
    });

    it("reports nested /index.ts imports", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `import { bar } from "../lib/utils/index.ts";`,
      );
      expect(reports.length).toBe(1);
      expect(reports[0]!.data?.suggested).toBe("../lib/utils");
    });

    it("reports type imports with /index.ts", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `import type { Foo } from "./types/index.ts";`,
      );
      expect(reports.length).toBe(1);
    });

    it("reports export from /index.ts", () => {
      const reports = runRule(
        "/project/src/index.ts",
        `export { foo } from "./utils/index.ts";`,
      );
      expect(reports.length).toBe(1);
    });

    it("reports export * from /index.ts", () => {
      const reports = runRule(
        "/project/src/index.ts",
        `export * from "./utils/index.ts";`,
      );
      expect(reports.length).toBe(1);
    });

    it("reports '.' imports - should use ./index instead", () => {
      const reports = runRule(
        "/project/src/utils/helper.ts",
        `import { foo } from ".";`,
      );
      expect(reports.length).toBe(1);
      expect(reports[0]!.messageId).toBe("useDotIndex");
    });

    it("reports '.' exports - should use ./index instead", () => {
      const reports = runRule(
        "/project/src/utils/helper.ts",
        `export { foo } from ".";`,
      );
      expect(reports.length).toBe(1);
      expect(reports[0]!.messageId).toBe("useDotIndex");
    });
  });

  describe("autofix", () => {
    it("fixes /index.ts to directory import", () => {
      const fixed = getFix(
        "/project/src/foo.ts",
        `import { bar } from "./utils/index.ts";`,
      );
      expect(fixed).toBe(`import { bar } from "./utils";`);
    });

    it("fixes /index to directory import", () => {
      const fixed = getFix(
        "/project/src/foo.ts",
        `import { bar } from "./utils/index";`,
      );
      expect(fixed).toBe(`import { bar } from "./utils";`);
    });

    it("fixes nested paths", () => {
      const fixed = getFix(
        "/project/src/foo.ts",
        `import { bar } from "../lib/utils/index.ts";`,
      );
      expect(fixed).toBe(`import { bar } from "../lib/utils";`);
    });

    it("fixes export statements", () => {
      const fixed = getFix(
        "/project/src/index.ts",
        `export { foo } from "./utils/index.ts";`,
      );
      expect(fixed).toBe(`export { foo } from "./utils";`);
    });

    it("preserves single quotes", () => {
      const fixed = getFix(
        "/project/src/foo.ts",
        `import { bar } from './utils/index.ts';`,
      );
      expect(fixed).toBe(`import { bar } from './utils';`);
    });

    it("fixes '.' to ./index", () => {
      const fixed = getFix(
        "/project/src/utils/helper.ts",
        `import { foo } from ".";`,
      );
      expect(fixed).toBe(`import { foo } from "./index";`);
    });
  });

  describe("future behavior", () => {
    // TODO: Dynamic imports like `import("./utils/index.ts")` should also be flagged.
    // Currently not implemented - the rule only catches static imports/exports.
    it.skip("should also catch dynamic imports with /index.ts", () => {
      const reports = runRule(
        "/project/src/foo.ts",
        `const utils = await import("./utils/index.ts");`,
      );
      expect(reports.length).toBe(1);
      expect(reports[0]!.messageId).toBe("noIndexImport");
    });
  });
});
