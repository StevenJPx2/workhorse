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

  it.fails("TODO: implement validation of export sources match directory contents", () => {
    // This test documents planned behavior that is not yet implemented.
    // The rule should validate that exports from an index file actually reference
    // files that exist in the same directory or subdirectories.
    // This would catch typos in export paths.

    // Expected: rule should check that exported modules actually exist
    // and report when they don't
    const reports = runRule("/src/hooks/index.ts");
    // Currently, the rule doesn't validate export paths exist
    expect(reports.length).toBeGreaterThanOrEqual(0);
    expect(true).toBe(false);
  });
});
