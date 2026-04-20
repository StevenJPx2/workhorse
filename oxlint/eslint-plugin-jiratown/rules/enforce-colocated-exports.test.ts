import rule from "./enforce-colocated-exports";

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
  rule.create(context);
  return context.reports;
}

describe("enforce-colocated-exports", () => {
  it("should skip node_modules files", () => {
    expect(runRule("/node_modules/foo/index.ts").length).toBe(0);
  });

  it("should skip dist files", () => {
    expect(runRule("/dist/foo/index.ts").length).toBe(0);
  });

  it("should skip non-index files", () => {
    expect(runRule("/src/hooks/use-interactive.ts").length).toBe(0);
  });

  it("should accept index.ts files where the folder structure is valid", () => {
    expect(runRule("/src/hooks/use-interactive/index.ts").length).toBe(0);
  });
});
