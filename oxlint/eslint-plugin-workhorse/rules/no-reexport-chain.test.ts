import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import rule from "./no-reexport-chain";

// Create a temp directory for test fixtures
const testDir = path.join(tmpdir(), "no-reexport-chain-test-" + Date.now());

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });

  // types.ts - canonical source
  writeFileSync(
    path.join(testDir, "types.ts"),
    `export type Foo = string;\nexport type Bar = number;\n`,
  );

  // agent.ts - re-exports from types.ts AND defines its own stuff
  writeFileSync(
    path.join(testDir, "agent.ts"),
    `export type { Foo, Bar } from "./types";\nexport class Agent { }\n`,
  );

  // utils.ts - defines locally (no re-exports)
  writeFileSync(
    path.join(testDir, "utils.ts"),
    `export function helper() { }\nexport const CONSTANT = 42;\n`,
  );

  // submodule/index.ts - a barrel that re-exports (should be allowed to chain from)
  mkdirSync(path.join(testDir, "submodule"), { recursive: true });
  writeFileSync(
    path.join(testDir, "submodule", "core.ts"),
    `export class Core { }\n`,
  );
  writeFileSync(
    path.join(testDir, "submodule", "index.ts"),
    `export { Core } from "./core";\n`,
  );
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

/** Create a mock ESLint context */
function createContext(filename: string) {
  const reports: Array<{
    node: unknown;
    messageId: string;
    data: Record<string, string>;
  }> = [];
  return {
    filename,
    report: (data: {
      node: unknown;
      messageId: string;
      data: Record<string, string>;
    }) => reports.push(data),
    reports,
  };
}

/** Run the rule on a mock ExportNamedDeclaration node */
function runRule(filename: string, source: string, specifiers: string[]) {
  const context = createContext(filename);
  const visitor = rule.create(context);

  if (!visitor.ExportNamedDeclaration) return context.reports;

  // Mock AST node for: export { ...specifiers } from "source"
  const node = {
    source: { value: source },
    specifiers: specifiers.map((name) => ({
      local: { name },
      exported: { name },
    })),
  };

  visitor.ExportNamedDeclaration(node);
  return context.reports;
}

describe("no-reexport-chain", () => {
  describe("valid cases", () => {
    it("skips non-barrel files", () => {
      const reports = runRule(path.join(testDir, "other.ts"), "./agent", [
        "Foo",
      ]);
      expect(reports).toHaveLength(0);
    });

    it("allows re-export from canonical source", () => {
      const reports = runRule(path.join(testDir, "index.ts"), "./utils", [
        "helper",
      ]);
      expect(reports).toHaveLength(0);
    });

    it("allows re-export of locally defined symbol", () => {
      const reports = runRule(path.join(testDir, "index.ts"), "./agent", [
        "Agent",
      ]);
      expect(reports).toHaveLength(0);
    });

    it("skips non-relative imports (npm packages)", () => {
      const reports = runRule(path.join(testDir, "index.ts"), "react", [
        "useState",
      ]);
      expect(reports).toHaveLength(0);
    });

    it("skips non-TypeScript files", () => {
      const reports = runRule(path.join(testDir, "index.js"), "./agent", [
        "Foo",
      ]);
      expect(reports).toHaveLength(0);
    });

    it("allows re-export from sub-barrel (folder with index.ts)", () => {
      // Even though submodule/index.ts re-exports Core from ./core.ts,
      // we should allow re-exporting from ./submodule since it's a barrel
      const reports = runRule(path.join(testDir, "index.ts"), "./submodule", [
        "Core",
      ]);
      expect(reports).toHaveLength(0);
    });
  });

  describe("invalid cases", () => {
    it("reports chained re-export (Foo via agent.ts from types.ts)", () => {
      const reports = runRule(path.join(testDir, "index.ts"), "./agent", [
        "Foo",
      ]);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.messageId).toBe("chainedReexport");
      expect(reports[0]!.data.name).toBe("Foo");
      expect(reports[0]!.data.intermediate).toBe("./agent");
      expect(reports[0]!.data.canonical).toBe("./types");
    });

    it("reports multiple chained re-exports", () => {
      const reports = runRule(path.join(testDir, "index.ts"), "./agent", [
        "Foo",
        "Bar",
      ]);
      expect(reports).toHaveLength(2);
      expect(reports[0]!.data.name).toBe("Foo");
      expect(reports[1]!.data.name).toBe("Bar");
    });

    it("reports only chained re-exports, not local definitions", () => {
      const reports = runRule(path.join(testDir, "index.ts"), "./agent", [
        "Agent",
        "Foo",
      ]);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data.name).toBe("Foo");
    });
  });
});
