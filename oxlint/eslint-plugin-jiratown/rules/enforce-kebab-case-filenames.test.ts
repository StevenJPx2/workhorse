import rule from "./enforce-kebab-case-filenames";

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

describe("enforce-kebab-case-filenames", () => {
  it("should accept kebab-case filenames", () => {
    expect(runRule("/src/ticket-sidebar.tsx").length).toBe(0);
    expect(runRule("/src/use-ticket-navigation.ts").length).toBe(0);
    expect(runRule("/src/index.ts").length).toBe(0);
  });

  it("should accept index.ts files", () => {
    expect(runRule("/src/hooks/index.ts").length).toBe(0);
    expect(runRule("/src/hooks/index.tsx").length).toBe(0);
  });

  it("should reject PascalCase filenames", () => {
    const reports = runRule("/src/TicketSidebar.tsx");
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("kebab-case");
  });

  it("should reject camelCase filenames", () => {
    const reports = runRule("/src/ticketSidebar.tsx");
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("kebab-case");
  });

  it("should suggest kebab-case conversion", () => {
    const reports = runRule("/src/TicketSidebar.tsx");
    expect(reports[0]!.message).toContain("ticket-sidebar.tsx");
  });

  it("should accept single-word filenames", () => {
    expect(runRule("/src/types.ts").length).toBe(0);
    expect(runRule("/src/config.ts").length).toBe(0);
  });

  it("should accept files with numbers", () => {
    expect(runRule("/src/use-modal2.ts").length).toBe(0);
  });

  it("should accept files with dots in the name", () => {
    expect(runRule("/vitest.config.ts").length).toBe(0);
    expect(runRule("/eslint.config.js").length).toBe(0);
    expect(runRule("/.eslintrc.js").length).toBe(0);
    expect(runRule("/my-module.d.ts").length).toBe(0);
  });

  it("should reject PascalCase config files", () => {
    const reports = runRule("/Vitest.config.ts");
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("kebab-case");
  });

  it("should reject camelCase with dots", () => {
    const reports = runRule("/myModule.config.ts");
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("kebab-case");
  });
});
