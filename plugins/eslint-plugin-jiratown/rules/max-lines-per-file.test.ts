import { describe, it, expect } from "bun:test";
import rule from "./max-lines-per-file";

function createContext(code: string, options: number[] = []) {
  const lines = code.split("\n");
  const reports: Array<{ message: string; loc: { line: number; column: number } }> = [];

  return {
    options,
    sourceCode: { lines },
    filename: "test-file.ts",
    report: (data: { message: string; loc: { line: number; column: number } }) => {
      reports.push(data);
    },
    reports,
  };
}

function runRule(code: string, maxLines: number = 200) {
  const context = createContext(code, [maxLines]);
  const visitor = rule.create(context);
  if (visitor.Program) {
    visitor.Program({});
  }
  if (visitor["Program:exit"]) {
    visitor["Program:exit"]();
  }
  return context.reports;
}

describe("max-lines-per-file", () => {
  it("should not report files within the limit", () => {
    const code = Array(50).fill("const x = 1;").join("\n");
    const reports = runRule(code, 200);
    expect(reports.length).toBe(0);
  });

  it("should not report files exactly at the limit", () => {
    const code = Array(200).fill("const x = 1;").join("\n");
    const reports = runRule(code, 200);
    expect(reports.length).toBe(0);
  });

  it("should report files exceeding the limit", () => {
    const code = Array(201).fill("const x = 1;").join("\n");
    const reports = runRule(code, 200);
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain("201 lines");
  });

  it("should respect custom max lines option", () => {
    const code = Array(101).fill("const x = 1;").join("\n");
    const reports = runRule(code, 100);
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain("101 lines");
  });

  it("should default to 200 lines when no option is provided", () => {
    const code = Array(201).fill("const x = 1;").join("\n");
    const context = createContext(code);
    const visitor = rule.create(context);
    if (visitor.Program) visitor.Program({});
    expect(context.reports.length).toBe(1);
    expect(context.reports[0].message).toContain("max: 200");
  });
});
