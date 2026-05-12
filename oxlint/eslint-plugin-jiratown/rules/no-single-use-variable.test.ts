import rule from "./no-single-use-variable";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Report = { message: string; node?: unknown };

function makeProgram(nodes: unknown[]) {
  const program = { type: "Program", body: nodes };
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
    // Call exit handlers (except Program:exit which we call manually at the end)
    if (node.type !== "Program") {
      const exitHandler = visitor[`${node.type}:exit`];
      if (exitHandler) exitHandler(node);
    }
  }

  walk(program);
  // Call Program:exit once at the very end (after all traversal is complete)
  if (visitor["Program:exit"]) visitor["Program:exit"]();
  return reports;
}

// ─── AST node factories ───────────────────────────────────────────────────────

const id = (name: string) => ({ type: "Identifier", name });

const literal = (value: unknown) => ({ type: "Literal", value });

const constDecl = (name: string, init = literal(42)) => ({
  type: "VariableDeclaration",
  kind: "const",
  declarations: [{ type: "VariableDeclarator", id: id(name), init }],
});

const letDecl = (name: string, init = literal(42)) => ({
  type: "VariableDeclaration",
  kind: "let",
  declarations: [{ type: "VariableDeclarator", id: id(name), init }],
});

const callExpr = (fnName: string, ...args: string[]) => ({
  type: "ExpressionStatement",
  expression: {
    type: "CallExpression",
    callee: id(fnName),
    arguments: args.map((a) => id(a)),
  },
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

const assignExpr = (name: string, value = literal(1)) => ({
  type: "ExpressionStatement",
  expression: {
    type: "AssignmentExpression",
    operator: "=",
    left: id(name),
    right: value,
  },
});

const forLoop = (body: unknown[]) => ({
  type: "ForStatement",
  init: null,
  test: null,
  update: null,
  body: { type: "BlockStatement", body },
});

const destructuringDecl = (props: string[], init) => ({
  type: "VariableDeclaration",
  kind: "const",
  declarations: [
    {
      type: "VariableDeclarator",
      id: {
        type: "ObjectPattern",
        properties: props.map((p) => ({
          type: "Property",
          key: id(p),
          value: id(p),
          shorthand: true,
        })),
      },
      init,
    },
  ],
});

const arrowFunc = (body: unknown[]) => ({
  type: "ArrowFunctionExpression",
  params: [],
  body: { type: "BlockStatement", body },
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("no-single-use-variable", () => {
  // ── Should report ────────────────────────────────────────────────────────

  it("reports a const variable used exactly once in the same scope", () => {
    const program = makeProgram([constDecl("foo"), callExpr("doSomething", "foo")]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("foo");
    expect(reports[0]!.message).toContain("Inline it");
  });

  it("reports a let variable used exactly once in the same scope", () => {
    const program = makeProgram([letDecl("bar"), callExpr("use", "bar")]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("bar");
  });

  it("reports when variable is used later in the same scope (not adjacent)", () => {
    const program = makeProgram([
      constDecl("ctx"),
      callExpr("doSomethingElse"),
      callExpr("doAnotherThing"),
      callExpr("use", "ctx"),
    ]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("ctx");
  });

  // ── Should not report ────────────────────────────────────────────────────

  it("does not report a variable used zero times", () => {
    const program = makeProgram([constDecl("unused")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a variable used more than once", () => {
    const program = makeProgram([
      constDecl("multi"),
      callExpr("use", "multi"),
      callExpr("use", "multi"),
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a variable used in a nested scope (closure)", () => {
    const program = makeProgram([
      constDecl("outer"),
      {
        type: "ExpressionStatement",
        expression: arrowFunc([callExpr("use", "outer")]),
      },
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report an exported variable", () => {
    const program = makeProgram([exportNamed(constDecl("exported")), callExpr("use", "exported")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a variable re-exported via export specifier", () => {
    const program = makeProgram([
      constDecl("reexported"),
      callExpr("use", "reexported"),
      exportSpecifiers(["reexported"]),
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a variable that is reassigned", () => {
    const program = makeProgram([
      letDecl("reassigned"),
      assignExpr("reassigned"),
      callExpr("use", "reassigned"),
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a variable declared inside a loop", () => {
    const program = makeProgram([forLoop([constDecl("loopVar"), callExpr("use", "loopVar")])]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report destructuring patterns", () => {
    const program = makeProgram([destructuringDecl(["a", "b"], id("obj")), callExpr("use", "a")]);
    expect(runRule(program)).toHaveLength(0);
  });

  it("does not report a variable without initializer", () => {
    const program = makeProgram([
      {
        type: "VariableDeclaration",
        kind: "let",
        declarations: [{ type: "VariableDeclarator", id: id("noInit"), init: null }],
      },
      callExpr("use", "noInit"),
    ]);
    expect(runRule(program)).toHaveLength(0);
  });

  // ── Multiple variables ───────────────────────────────────────────────────

  it("reports only the single-use variable when multiple are defined", () => {
    const program = makeProgram([
      constDecl("once"),
      constDecl("twice"),
      callExpr("use", "once"),
      callExpr("use", "twice"),
      callExpr("use", "twice"),
    ]);
    const reports = runRule(program);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.message).toContain("once");
  });

  // ── Metadata ─────────────────────────────────────────────────────────────

  it("has correct rule metadata", () => {
    expect(rule.meta.docs.description).toContain("declared and used exactly once");
  });
});
