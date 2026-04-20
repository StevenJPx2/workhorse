import { describe, it, expect } from "bun:test";
import rule from "./no-single-reference-function";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Report = { message: string };

// Run the rule against source by simulating AST visitor calls.
// We use a hand-rolled "AST" that mirrors the real shapes just enough
// for the rule to exercise its logic.
function makeProgram(nodes: unknown[]) {
  const program = { type: "Program", body: nodes };
  // set parent pointers
  function setParents(node, parent) {
    if (!node || typeof node !== "object") return;
    node.parent = parent;
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((c) => setParents(c, node));
      } else if (child && typeof child === "object" && child.type) {
        setParents(child, node);
      }
    }
  }
  setParents(program, null);
  return program;
}

function runRule(program) {
  const reports: Report[] = [];
  const context = { report: (r: Report) => reports.push(r) };
  const visitor = rule.create(context);

  function walk(node) {
    if (!node || typeof node !== "object") return;
    const handler = visitor[node.type];
    if (handler) handler(node);
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object" && child.type) walk(child);
    }
  }

  walk(program);
  if (visitor["Program:exit"]) visitor["Program:exit"]();
  return reports;
}

// ─── AST node factories ───────────────────────────────────────────────────────

const id = (name: string) => ({ type: "Identifier", name });
const callExpr = (name: string) => ({
  type: "ExpressionStatement",
  expression: { type: "CallExpression", callee: id(name), arguments: [] },
});
const funcDecl = (name: string) => ({
  type: "FunctionDeclaration",
  id: id(name),
  params: [],
  body: { type: "BlockStatement", body: [] },
});
const constArrow = (name: string) => ({
  type: "VariableDeclaration",
  kind: "const",
  declarations: [
    {
      type: "VariableDeclarator",
      id: id(name),
      init: {
        type: "ArrowFunctionExpression",
        params: [],
        body: { type: "BlockStatement", body: [] },
      },
    },
  ],
});
const constFuncExpr = (name: string) => ({
  type: "VariableDeclaration",
  kind: "const",
  declarations: [
    {
      type: "VariableDeclarator",
      id: id(name),
      init: { type: "FunctionExpression", params: [], body: { type: "BlockStatement", body: [] } },
    },
  ],
});
const exportNamed = (decl) => ({
  type: "ExportNamedDeclaration",
  declaration: decl,
  specifiers: [],
});
const exportSpecifiers = (names: string[]) => ({
  type: "ExportNamedDeclaration",
  declaration: null,
  specifiers: names.map((n) => ({ type: "ExportSpecifier", local: id(n), exported: id(n) })),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("no-single-reference-function", () => {
  // ── Should report ────────────────────────────────────────────────────────

  it("reports a function declaration used exactly once", () => {
    const program = makeProgram([funcDecl("foo"), callExpr("foo")]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("foo");
    expect(reports[0]!.message).toContain("Inline it");
  });

  it("reports a const arrow function used exactly once", () => {
    const program = makeProgram([constArrow("bar"), callExpr("bar")]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("bar");
  });

  it("reports a const function expression used exactly once", () => {
    const program = makeProgram([constFuncExpr("baz"), callExpr("baz")]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("baz");
  });

  // ── Should not report ────────────────────────────────────────────────────

  it("does not report a function used zero times", () => {
    const program = makeProgram([funcDecl("unused")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a function used more than once", () => {
    const program = makeProgram([funcDecl("multi"), callExpr("multi"), callExpr("multi")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report an exported function declaration", () => {
    const decl = funcDecl("exported");
    const program = makeProgram([exportNamed(decl), callExpr("exported")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report an exported const arrow function", () => {
    const decl = constArrow("exportedArrow");
    const program = makeProgram([exportNamed(decl), callExpr("exportedArrow")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a function re-exported via export specifier", () => {
    const program = makeProgram([
      funcDecl("reexported"),
      callExpr("reexported"),
      exportSpecifiers(["reexported"]),
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a non-function const used once", () => {
    const program = makeProgram([
      {
        type: "VariableDeclaration",
        kind: "const",
        declarations: [
          { type: "VariableDeclarator", id: id("VALUE"), init: { type: "Literal", value: 42 } },
        ],
      },
      callExpr("VALUE"),
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a function declaration inside another function", () => {
    const inner = {
      type: "FunctionDeclaration",
      id: id("inner"),
      params: [],
      body: { type: "BlockStatement", body: [] },
    };
    const outer = {
      type: "FunctionDeclaration",
      id: id("outer"),
      params: [],
      body: { type: "BlockStatement", body: [inner, callExpr("inner")] },
    };
    const program = makeProgram([outer, callExpr("outer")]);
    const reports = runRule(program);
    // outer is used once → reported. inner is nested → not tracked.
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("outer");
  });

  it("does not count member expression property access as a reference", () => {
    // obj.foo() — foo here is a property key, not a reference to function foo
    const program = makeProgram([
      funcDecl("foo"),
      {
        type: "ExpressionStatement",
        expression: {
          type: "CallExpression",
          callee: {
            type: "MemberExpression",
            object: id("obj"),
            property: id("foo"),
            computed: false,
          },
          arguments: [],
        },
      },
    ]);
    // foo has 0 real references → not reported (0-reference case)
    expect(runRule(program)).toHaveLength(0);
  });

  // ── Multiple functions ───────────────────────────────────────────────────

  it("reports only the single-use function when multiple are defined", () => {
    const program = makeProgram([
      funcDecl("once"),
      funcDecl("twice"),
      callExpr("once"),
      callExpr("twice"),
      callExpr("twice"),
    ]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("once");
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it("has correct rule metadata", () => {
    expect(rule.meta.docs.description).toContain("only referenced in a single place");
  });
});
