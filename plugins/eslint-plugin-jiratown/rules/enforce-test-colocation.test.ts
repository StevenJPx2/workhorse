import { describe, it, expect } from "bun:test";
import rule from "./enforce-test-colocation";

function createContext(filename: string) {
  const reports: Array<{ message: string; loc: { line: number; column: number } }> = [];

  return {
    filename,
    report: (data: { message: string; loc: { line: number; column: number } }) => {
      reports.push(data);
    },
    reports,
  };
}

function runRule(filename: string) {
  const context = createContext(filename);
  const visitor = rule.create(context);
  return context.reports;
}

describe("enforce-test-colocation", () => {
  it("should skip files in node_modules", () => {
    expect(runRule("/project/node_modules/pkg/src/index.ts").length).toBe(0);
  });

  it("should skip files in __tests__ directories", () => {
    expect(runRule("/project/src/hooks/__tests__/use-interactive.test.ts").length).toBe(0);
  });

  it("should skip files in dist", () => {
    expect(runRule("/project/dist/src/index.ts").length).toBe(0);
  });

  it("should not report folders with 2 or fewer source files", () => {
    expect(runRule("/project/src/hooks/use-interactive/use-interactive.ts").length).toBe(0);
  });

  it("should not report when test ratio is within 40% threshold", () => {
    expect(runRule("/project/src/hooks/use-interactive/index.ts").length).toBe(0);
  });

  it("should have correct rule metadata", () => {
    expect(rule.meta.docs.description).toContain("test file colocation");
  });
});
