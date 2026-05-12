import rule from "./no-cascading-ternary";

// Simple mock AST node types for testing
interface ConditionalExpression {
  type: "ConditionalExpression";
  test: unknown;
  consequent: unknown;
  alternate: unknown;
  parent?: unknown;
  loc: { start: { line: number; column: number }; end: { line: number; column: number } };
}

interface Report {
  node: unknown;
  message: string;
}

function createContext(options: unknown[] = []) {
  const reports: Report[] = [];

  return {
    options,
    sourceCode: {
      text: "",
    },
    filename: "test-file.ts",
    report: (data: Report) => {
      reports.push(data);
    },
    reports,
  };
}

function createConditionalExpr(
  alternate: unknown = { type: "Literal" },
  consequent: unknown = { type: "Literal" },
): ConditionalExpression {
  const node: ConditionalExpression = {
    type: "ConditionalExpression",
    test: { type: "BinaryExpression" },
    consequent,
    alternate,
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
  };
  // Set parent references for nested expressions
  if (alternate && typeof alternate === "object" && "type" in alternate) {
    (alternate as { parent?: unknown }).parent = node;
  }
  if (consequent && typeof consequent === "object" && "type" in consequent) {
    (consequent as { parent?: unknown }).parent = node;
  }
  return node;
}

function runRule(node: ConditionalExpression, options: unknown[] = []) {
  const context = createContext(options);
  const visitor = rule.create(context);
  if (visitor.ConditionalExpression) {
    visitor.ConditionalExpression(node);
  }
  return context.reports;
}

describe("no-cascading-ternary", () => {
  describe("default maxDepth (1)", () => {
    it("allows simple ternary expressions", () => {
      // a ? b : c (depth = 1)
      const node = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const reports = runRule(node);
      expect(reports.length).toBe(0);
    });

    it("reports 2-level nested ternary in alternate", () => {
      // a ? b : c ? d : e (depth = 2)
      const inner = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const outer = createConditionalExpr(inner, { type: "Literal" });
      const reports = runRule(outer);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/2 levels deep/);
    });

    it("reports 2-level nested ternary in consequent", () => {
      // a ? (b ? c : d) : e (depth = 2)
      const inner = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const outer = createConditionalExpr({ type: "Literal" }, inner);
      const reports = runRule(outer);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/2 levels deep/);
    });

    it("reports 3-level nested ternary", () => {
      // a ? b : c ? d : e ? f : g (depth = 3)
      const level3 = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const level2 = createConditionalExpr(level3, { type: "Literal" });
      const level1 = createConditionalExpr(level2, { type: "Literal" });
      const reports = runRule(level1);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/3 levels deep/);
      expect(reports[0]!.message).toMatch(/object map or switch/);
    });

    it("reports deeply nested ternary (4+ levels)", () => {
      // Build a 5-level deep ternary
      let node = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      for (let i = 0; i < 4; i++) {
        node = createConditionalExpr(node, { type: "Literal" });
      }
      const reports = runRule(node);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/5 levels deep/);
    });
  });

  describe("custom maxDepth", () => {
    it("allows 2-level nesting when maxDepth is 2", () => {
      // a ? b : c ? d : e (depth = 2)
      const inner = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const outer = createConditionalExpr(inner, { type: "Literal" });
      const reports = runRule(outer, [{ maxDepth: 2 }]);
      expect(reports.length).toBe(0);
    });

    it("reports 3-level nesting when maxDepth is 2", () => {
      // depth = 3
      const level3 = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const level2 = createConditionalExpr(level3, { type: "Literal" });
      const level1 = createConditionalExpr(level2, { type: "Literal" });
      const reports = runRule(level1, [{ maxDepth: 2 }]);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/3 levels deep/);
    });
  });

  describe("does not duplicate reports", () => {
    it("only reports on the root of a ternary chain", () => {
      // When visiting from the inner node (with parent set), should not report
      const inner = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const outer = createConditionalExpr(inner, { type: "Literal" });
      // inner.parent is set to outer by createConditionalExpr

      // Running on inner node should not report (it's not the root)
      const context = createContext([]);
      const visitor = rule.create(context);
      visitor.ConditionalExpression(inner);
      expect(context.reports.length).toBe(0);

      // Running on outer should report
      visitor.ConditionalExpression(outer);
      expect(context.reports.length).toBe(1);
    });
  });

  describe("mixed nesting patterns", () => {
    it("reports when both branches have nesting (max depth counts)", () => {
      // a ? (b ? c : d) : (e ? f : g) - both branches nested
      const consequentNested = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const alternateNested = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const outer = createConditionalExpr(alternateNested, consequentNested);
      const reports = runRule(outer);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/2 levels deep/);
    });

    it("reports based on deepest branch", () => {
      // a ? (b ? c : d) : (e ? f : g ? h : i) - alternate is deeper
      const consequentNested = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const deepInner = createConditionalExpr({ type: "Literal" }, { type: "Literal" });
      const alternateNested = createConditionalExpr(deepInner, { type: "Literal" });
      const outer = createConditionalExpr(alternateNested, consequentNested);
      const reports = runRule(outer);
      expect(reports.length).toBe(1);
      expect(reports[0]!.message).toMatch(/3 levels deep/);
    });
  });
});
