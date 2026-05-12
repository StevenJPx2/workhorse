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
    expect(reports[0]!.message).toContain("201 lines");
  });

  it("should respect custom max lines option", () => {
    const code = Array(101).fill("const x = 1;").join("\n");
    const reports = runRule(code, 100);
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("101 lines");
  });

  it("should default to 200 lines when no option is provided", () => {
    const code = Array(201).fill("const x = 1;").join("\n");
    const context = createContext(code);
    const visitor = rule.create(context);
    if (visitor.Program) visitor.Program({});
    expect(context.reports.length).toBe(1);
    expect(context.reports[0]!.message).toContain("max: 200");
  });

  it.fails("TODO: implement skipBlankLines option", () => {
    // This test documents planned behavior that is not yet implemented.
    // The rule should support a skipBlankLines option to exclude blank lines from count.
    const codeWithBlanks = [
      ...Array(100).fill("const x = 1;"),
      ...Array(150).fill(""), // blank lines
      ...Array(50).fill("const y = 2;"),
    ].join("\n");

    // Currently the rule only accepts number[], but ideally it would support
    // [maxLines, { skipBlankLines: boolean }] format
    const context = createContext(codeWithBlanks, [200]);
    const visitor = rule.create(context);
    if (visitor.Program) visitor.Program({});

    // Expected: with skipBlankLines, only 150 non-blank lines should be counted
    // so it should pass the 200 line limit. Currently this fails because
    // the rule counts all lines including blank ones.
    expect(context.reports.length).toBe(0);
  });
});
