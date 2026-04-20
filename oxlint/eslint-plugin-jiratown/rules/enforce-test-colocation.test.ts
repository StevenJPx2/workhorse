import { vi } from "vitest";

// ─── fs mock setup ────────────────────────────────────────────────────────────
// We mock `node:fs` so tests never touch the real filesystem.
// Each test can configure `fakeEntries` / `fakeDirs` as needed.

let fakeEntries: string[] = [];
const fakeDirs = new Set<string>();

vi.mock("node:fs", () => ({
  default: {
    readdirSync: (_dir: string) => fakeEntries,
    statSync: (p: string) => ({
      isDirectory: () => fakeDirs.has(p),
    }),
  },
}));

// Import the rule AFTER the mock is registered so it picks up the fake fs.
const { default: rule } = await import("./enforce-test-colocation");

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("enforce-test-colocation", () => {
  beforeEach(() => {
    fakeEntries = [];
    fakeDirs.clear();
  });

  // ── Early-exit guards ────────────────────────────────────────────────────

  it("should skip files in node_modules", () => {
    expect(runRule("/project/node_modules/pkg/src/index.ts").length).toBe(0);
  });

  it("should skip files in __tests__ directories", () => {
    expect(runRule("/project/src/hooks/__tests__/use-interactive.test.ts").length).toBe(0);
  });

  it("should skip files in dist", () => {
    expect(runRule("/project/dist/src/index.ts").length).toBe(0);
  });

  // ── Ratio-based condition ────────────────────────────────────────────────

  it("should not report folders with 2 or fewer source files", () => {
    fakeEntries = ["index.ts", "index.test.ts"];
    expect(runRule("/project/src/hooks/index.ts").length).toBe(0);
  });

  it("should not report when test ratio is within 40% threshold", () => {
    fakeEntries = ["a.ts", "b.ts", "c.ts", "a.test.ts"];
    expect(runRule("/project/src/hooks/a.ts").length).toBe(0);
  });

  it("should report when test ratio exceeds 40%", () => {
    // 3 impl + 3 test = 50% ratio → exceeds threshold
    fakeEntries = ["a.ts", "b.ts", "c.ts", "a.test.ts", "b.test.ts", "c.test.ts"];
    const reports = runRule("/project/src/hooks/a.ts");
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("Move tests to a __tests__/ directory");
  });

  // ── __tests__/ directory already exists ─────────────────────────────────

  it("should report a test file when __tests__/ already exists as a sibling", () => {
    fakeEntries = ["index.ts", "index.test.ts", "__tests__"];
    fakeDirs.add("/project/src/hooks/__tests__");

    const reports = runRule("/project/src/hooks/index.test.ts");
    expect(reports.length).toBe(1);
    expect(reports[0]!.message).toContain("A __tests__/ directory already exists");
    expect(reports[0]!.message).toContain("Move this test file inside __tests__/ instead");
  });

  it("should not report a non-test file when __tests__/ exists as a sibling", () => {
    fakeEntries = ["index.ts", "__tests__"];
    fakeDirs.add("/project/src/hooks/__tests__");

    expect(runRule("/project/src/hooks/index.ts").length).toBe(0);
  });

  it("should not report a test file when no __tests__/ sibling directory exists", () => {
    // There is an entry called __tests__ but it's not a directory (edge-case)
    fakeEntries = ["index.ts", "index.test.ts", "__tests__"];
    // fakeDirs is empty → statSync.isDirectory() returns false

    // With only 2 total source files the ratio guard fires first → still 0 reports
    expect(runRule("/project/src/hooks/index.test.ts").length).toBe(0);
  });

  it("should not flag a test file already inside __tests__/ even when a sibling __tests__/ dir exists", () => {
    // The early-return for paths containing "__tests__" covers this
    fakeEntries = ["use-interactive.test.ts"];
    fakeDirs.add("/project/src/hooks/__tests__");

    expect(runRule("/project/src/hooks/__tests__/use-interactive.test.ts").length).toBe(0);
  });

  it("should include the folder name in the __tests__/ violation message", () => {
    fakeEntries = ["index.ts", "index.test.ts", "__tests__"];
    fakeDirs.add("/project/src/hooks/__tests__");

    const reports = runRule("/project/src/hooks/index.test.ts");
    expect(reports[0]!.message).toContain('"hooks"');
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it("should have correct rule metadata", () => {
    expect(rule.meta.docs.description).toContain("test file colocation");
    expect(rule.meta.docs.description).toContain("__tests__/ directory already exists");
  });
});
