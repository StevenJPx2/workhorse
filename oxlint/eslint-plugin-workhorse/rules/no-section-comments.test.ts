import rule from "./no-section-comments";

type Comment = {
  type: "Line" | "Block";
  value: string;
  loc: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  range: [number, number];
};

type Report = {
  node: Comment;
  message: string;
  fix?: (fixer: unknown) => unknown;
};

function createContext(comments: Comment[]) {
  const reports: Report[] = [];

  return {
    options: [],
    sourceCode: {
      getAllComments: () => comments,
      text: "// test comment\nconst x = 1;",
    },
    filename: "test-file.ts",
    report: (data: Report) => {
      reports.push(data);
    },
    reports,
  };
}

function createLineComment(value: string, line = 1): Comment {
  return {
    type: "Line",
    value,
    loc: {
      start: { line, column: 0 },
      end: { line, column: value.length + 2 },
    },
    range: [0, value.length + 2],
  };
}

function createBlockComment(value: string, line = 1): Comment {
  return {
    type: "Block",
    value,
    loc: {
      start: { line, column: 0 },
      end: { line, column: value.length + 4 },
    },
    range: [0, value.length + 4],
  };
}

function runRule(comments: Comment[]) {
  const context = createContext(comments);
  const visitor = rule.create(context);
  if (visitor.Program) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (visitor.Program as any)();
  }
  return context.reports;
}

describe("no-section-comments", () => {
  describe("reports section divider patterns", () => {
    it("reports double-dash dividers", () => {
      const reports = runRule([createLineComment(" --")]);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/section divider/i);
    });

    it("reports multi-dash dividers", () => {
      const reports = runRule([createLineComment(" ---")]);
      expect(reports.length).toBe(1);
    });

    it("reports long divider lines", () => {
      const reports = runRule([
        createLineComment(" ----------------------------------------"),
      ]);
      expect(reports.length).toBe(1);
    });

    it("reports equals separator lines", () => {
      const reports = runRule([createLineComment(" ===")]);
      expect(reports.length).toBe(1);
    });

    it("reports long equals separator", () => {
      const reports = runRule([
        createLineComment(" ================================"),
      ]);
      expect(reports.length).toBe(1);
    });
  });

  describe("reports numbered step patterns", () => {
    it("reports numbered steps like '1.'", () => {
      const reports = runRule([createLineComment(" 1. First do this")]);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/numbered step/i);
    });

    it("reports multi-digit numbered steps", () => {
      const reports = runRule([createLineComment(" 12. Twelfth step")]);
      expect(reports.length).toBe(1);
    });

    it("reports Step N: label format", () => {
      const reports = runRule([createLineComment(" Step 1: Initialize")]);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/step label/i);
    });

    it("reports STEP N: label format (case insensitive)", () => {
      const reports = runRule([createLineComment(" STEP 2: Configure")]);
      expect(reports.length).toBe(1);
    });
  });

  describe("allows valid comments", () => {
    it("allows normal comments", () => {
      const reports = runRule([createLineComment(" This is a normal comment")]);
      expect(reports.length).toBe(0);
    });

    it("allows comments explaining code", () => {
      const reports = runRule([
        createLineComment(" Calculate the sum of all values"),
      ]);
      expect(reports.length).toBe(0);
    });

    it("allows single dash in sentence", () => {
      const reports = runRule([createLineComment(" Use foo - it's better")]);
      expect(reports.length).toBe(0);
    });

    it("allows numbers in middle of comment", () => {
      const reports = runRule([
        createLineComment(" Returns value + 1. Always positive."),
      ]);
      expect(reports.length).toBe(0);
    });

    it("allows block comments", () => {
      const reports = runRule([
        createBlockComment(" This is a block comment "),
      ]);
      expect(reports.length).toBe(0);
    });

    it("allows JSDoc-style block comments with separators", () => {
      // Block comments are allowed to have dashes/equals for formatting
      const reports = runRule([
        createBlockComment("*\n * Description\n * ---\n * 1. Item\n "),
      ]);
      expect(reports.length).toBe(0);
    });

    it("allows TODO comments", () => {
      const reports = runRule([createLineComment(" TODO: Fix this later")]);
      expect(reports.length).toBe(0);
    });

    it("allows FIXME comments", () => {
      const reports = runRule([createLineComment(" FIXME: Handle edge case")]);
      expect(reports.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("allows empty line comments", () => {
      const reports = runRule([createLineComment("")]);
      expect(reports.length).toBe(0);
    });

    it("reports multiple violations", () => {
      const reports = runRule([
        createLineComment(" --", 1),
        createLineComment(" ===", 3),
        createLineComment(" 1. First step", 5),
      ]);
      expect(reports.length).toBe(3);
    });
  });
});
