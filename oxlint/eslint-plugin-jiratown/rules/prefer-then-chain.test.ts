import { describe, it, expect } from "vitest";
import rule from "./prefer-then-chain";

// Minimal AST node types for testing
interface BaseNode {
  type: string;
  parent?: BaseNode;
  range?: [number, number];
}

interface Identifier extends BaseNode {
  type: "Identifier";
  name: string;
}

interface CallExpression extends BaseNode {
  type: "CallExpression";
  callee: BaseNode;
  arguments: BaseNode[];
}

interface MemberExpression extends BaseNode {
  type: "MemberExpression";
  object: BaseNode;
  property: BaseNode;
  computed: boolean;
}

interface AwaitExpression extends BaseNode {
  type: "AwaitExpression";
  argument: BaseNode;
}

interface TSNonNullExpression extends BaseNode {
  type: "TSNonNullExpression";
  expression: BaseNode;
}

interface TSAsExpression extends BaseNode {
  type: "TSAsExpression";
  expression: BaseNode;
  typeAnnotation: BaseNode;
}

interface Literal extends BaseNode {
  type: "Literal";
  value: number | string;
  raw: string;
}

type Report = {
  node: BaseNode;
  message: string;
  fix?: (fixer: {
    replaceText: (node: BaseNode, text: string) => { range: [number, number]; text: string };
  }) => { range: [number, number]; text: string };
};

function createContext(sourceText: string) {
  const reports: Report[] = [];

  return {
    options: [],
    sourceCode: {
      getText: (node: BaseNode) => {
        if (!node.range) return "???";
        return sourceText.slice(node.range[0], node.range[1]);
      },
      text: sourceText,
    },
    filename: "test-file.ts",
    report: (data: Report) => {
      reports.push(data);
    },
    reports,
  };
}

describe("prefer-then-chain", () => {
  describe("detects parenthesized await with member access", () => {
    it("reports (await foo())[0]", () => {
      const source = "(await this.db.insert(x).returning())[0]!";
      const context = createContext(source);

      // Build AST nodes
      const innerCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 36], // "this.db.insert(x).returning()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: innerCall,
        range: [1, 36], // "await this.db.insert(x).returning()"
      };

      const indexLiteral: Literal = {
        type: "Literal",
        value: 0,
        raw: "0",
        range: [38, 39], // "0"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: indexLiteral,
        computed: true,
        range: [0, 40], // "(await this.db.insert(x).returning())[0]"
      };

      const nonNullExpr: TSNonNullExpression = {
        type: "TSNonNullExpression",
        expression: memberExpr,
        range: [0, 41], // "(await this.db.insert(x).returning())[0]!"
      };

      // Set up parent relationships
      innerCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      indexLiteral.parent = memberExpr;
      memberExpr.parent = nonNullExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      expect(context.reports[0]!.message).toContain(".then()");
      expect(context.reports[0]!.message).toContain("this.db.insert(x).returning()");
    });

    it("reports (await fetch(url)).json()", () => {
      const source = "(await fetch(url)).json()";
      const context = createContext(source);

      const fetchCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 17], // "fetch(url)"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: fetchCall,
        range: [1, 17], // "await fetch(url)"
      };

      const jsonIdent: Identifier = {
        type: "Identifier",
        name: "json",
        range: [19, 23], // "json"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: jsonIdent,
        computed: false,
        range: [0, 23], // "(await fetch(url)).json"
      };

      const callExpr: CallExpression = {
        type: "CallExpression",
        callee: memberExpr,
        arguments: [],
        range: [0, 25], // "(await fetch(url)).json()"
      };

      // Set up parent relationships
      fetchCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      jsonIdent.parent = memberExpr;
      memberExpr.parent = callExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      expect(context.reports[0]!.message).toContain(".then()");
    });

    it("reports (await getUser()).name", () => {
      const source = "(await getUser()).name";
      const context = createContext(source);

      const getUserCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 16], // "getUser()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getUserCall,
        range: [1, 16], // "await getUser()"
      };

      const nameIdent: Identifier = {
        type: "Identifier",
        name: "name",
        range: [18, 22], // "name"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: nameIdent,
        computed: false,
        range: [0, 22], // "(await getUser()).name"
      };

      // Set up parent relationships
      getUserCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      nameIdent.parent = memberExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      expect(context.reports[0]!.message).toContain(".then()");
      expect(context.reports[0]!.message).toContain("getUser()");
    });
  });

  describe("detects parenthesized await with type assertions", () => {
    it("reports (await getData()) as MyType", () => {
      const source = "(await getData()) as MyType";
      const context = createContext(source);

      const getDataCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 16], // "getData()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getDataCall,
        range: [1, 16], // "await getData()"
      };

      const typeAnnotation: BaseNode = {
        type: "TSTypeReference",
        range: [21, 27], // "MyType"
      };

      const asExpr: TSAsExpression = {
        type: "TSAsExpression",
        expression: awaitExpr,
        typeAnnotation,
        range: [0, 27], // "(await getData()) as MyType"
      };

      // Set up parent relationships
      getDataCall.parent = awaitExpr;
      awaitExpr.parent = asExpr;
      typeAnnotation.parent = asExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      expect(context.reports[0]!.message).toContain(".then()");
      expect(context.reports[0]!.message).toContain("as MyType");
    });
  });

  describe("detects parenthesized await with non-null assertion", () => {
    it("reports (await getArray())!", () => {
      const source = "(await getArray())!";
      const context = createContext(source);

      const getArrayCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 17], // "getArray()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getArrayCall,
        range: [1, 17], // "await getArray()"
      };

      const nonNullExpr: TSNonNullExpression = {
        type: "TSNonNullExpression",
        expression: awaitExpr,
        range: [0, 19], // "(await getArray())!"
      };

      // Set up parent relationships
      getArrayCall.parent = awaitExpr;
      awaitExpr.parent = nonNullExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      expect(context.reports[0]!.message).toContain(".then()");
      expect(context.reports[0]!.message).toContain("r!");
    });
  });

  describe("does not report valid patterns", () => {
    it("allows plain await expressions", () => {
      const source = "await fetch(url)";
      const context = createContext(source);

      const fetchCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [6, 16], // "fetch(url)"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: fetchCall,
        range: [0, 16], // "await fetch(url)"
      };

      // Parent is not an operation
      const program: BaseNode = {
        type: "Program",
      };

      fetchCall.parent = awaitExpr;
      awaitExpr.parent = program;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(0);
    });

    it("allows await in variable assignment", () => {
      const source = "const result = await fetch(url)";
      const context = createContext(source);

      const fetchCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [21, 31], // "fetch(url)"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: fetchCall,
        range: [15, 31], // "await fetch(url)"
      };

      const declarator: BaseNode = {
        type: "VariableDeclarator",
      };

      fetchCall.parent = awaitExpr;
      awaitExpr.parent = declarator;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(0);
    });

    it("allows .then() chains", () => {
      const source = "await fetch(url).then(r => r.json())";
      const context = createContext(source);

      // The await's argument is the .then() call, so parent of await is not an operation
      const thenCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [6, 36], // "fetch(url).then(r => r.json())"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: thenCall,
        range: [0, 36], // "await fetch(url).then(r => r.json())"
      };

      const program: BaseNode = {
        type: "Program",
      };

      thenCall.parent = awaitExpr;
      awaitExpr.parent = program;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(0);
    });
  });

  describe("fix generation", () => {
    it("generates correct fix for member access", () => {
      const source = "(await getUser()).name";
      const context = createContext(source);

      const getUserCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 16], // "getUser()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getUserCall,
        range: [1, 16], // "await getUser()"
      };

      const nameIdent: Identifier = {
        type: "Identifier",
        name: "name",
        range: [18, 22], // "name"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: nameIdent,
        computed: false,
        range: [0, 22], // "(await getUser()).name"
      };

      getUserCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      nameIdent.parent = memberExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      const report = context.reports[0]!;
      expect(report.fix).toBeDefined();

      if (report.fix) {
        const fixer = {
          replaceText: (node: BaseNode, text: string) => ({
            range: node.range as [number, number],
            text,
          }),
        };
        const fixResult = report.fix(fixer);
        expect(fixResult.text).toBe("await getUser().then((r) => r.name)");
      }
    });

    it("generates correct fix for computed member access with non-null", () => {
      const source = "(await getData())[0]!";
      const context = createContext(source);

      const getDataCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 16], // "getData()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getDataCall,
        range: [1, 16], // "await getData()"
      };

      const indexLiteral: Literal = {
        type: "Literal",
        value: 0,
        raw: "0",
        range: [18, 19], // "0"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: indexLiteral,
        computed: true,
        range: [0, 20], // "(await getData())[0]"
      };

      const nonNullExpr: TSNonNullExpression = {
        type: "TSNonNullExpression",
        expression: memberExpr,
        range: [0, 21], // "(await getData())[0]!"
      };

      getDataCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      indexLiteral.parent = memberExpr;
      memberExpr.parent = nonNullExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      const report = context.reports[0]!;
      expect(report.fix).toBeDefined();

      if (report.fix) {
        const fixer = {
          replaceText: (node: BaseNode, text: string) => ({
            range: node.range as [number, number],
            text,
          }),
        };
        const fixResult = report.fix(fixer);
        expect(fixResult.text).toBe("await getData().then((r) => r[0]!)");
      }
    });
  });

  describe("includes nullish coalescing in the fix", () => {
    interface LogicalExpression extends BaseNode {
      type: "LogicalExpression";
      operator: "??" | "||";
      left: BaseNode;
      right: BaseNode;
    }

    interface ArrayExpression extends BaseNode {
      type: "ArrayExpression";
      elements: BaseNode[];
    }

    it("reports (await getComments()).comments ?? [] and includes ?? [] in fix", () => {
      const source = "(await getComments()).comments ?? []";
      const context = createContext(source);

      const getCommentsCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 20], // "getComments()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getCommentsCall,
        range: [1, 20], // "await getComments()"
      };

      const commentsIdent: Identifier = {
        type: "Identifier",
        name: "comments",
        range: [22, 30], // "comments"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: commentsIdent,
        computed: false,
        range: [0, 30], // "(await getComments()).comments"
      };

      const emptyArray: ArrayExpression = {
        type: "ArrayExpression",
        elements: [],
        range: [34, 36], // "[]"
      };

      const logicalExpr: LogicalExpression = {
        type: "LogicalExpression",
        operator: "??",
        left: memberExpr,
        right: emptyArray,
        range: [0, 36], // "(await getComments()).comments ?? []"
      };

      // Set up parent relationships
      getCommentsCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      commentsIdent.parent = memberExpr;
      memberExpr.parent = logicalExpr;
      emptyArray.parent = logicalExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      const report = context.reports[0]!;
      expect(report.fix).toBeDefined();

      if (report.fix) {
        const fixer = {
          replaceText: (node: BaseNode, text: string) => ({
            range: node.range as [number, number],
            text,
          }),
        };
        const fixResult = report.fix(fixer);
        // The fix should include ?? [] inside the .then() callback
        expect(fixResult.text).toBe("await getComments().then((r) => r.comments ?? [])");
      }
    });

    it("reports (await getData()).value || defaultValue and includes || in fix", () => {
      const source = "(await getData()).value || defaultValue";
      const context = createContext(source);

      const getDataCall: CallExpression = {
        type: "CallExpression",
        callee: {} as BaseNode,
        arguments: [],
        range: [7, 16], // "getData()"
      };

      const awaitExpr: AwaitExpression = {
        type: "AwaitExpression",
        argument: getDataCall,
        range: [1, 16], // "await getData()"
      };

      const valueIdent: Identifier = {
        type: "Identifier",
        name: "value",
        range: [18, 23], // "value"
      };

      const memberExpr: MemberExpression = {
        type: "MemberExpression",
        object: awaitExpr,
        property: valueIdent,
        computed: false,
        range: [0, 23], // "(await getData()).value"
      };

      const defaultIdent: Identifier = {
        type: "Identifier",
        name: "defaultValue",
        range: [27, 39], // "defaultValue"
      };

      const logicalExpr: LogicalExpression = {
        type: "LogicalExpression",
        operator: "||",
        left: memberExpr,
        right: defaultIdent,
        range: [0, 39], // "(await getData()).value || defaultValue"
      };

      // Set up parent relationships
      getDataCall.parent = awaitExpr;
      awaitExpr.parent = memberExpr;
      valueIdent.parent = memberExpr;
      memberExpr.parent = logicalExpr;
      defaultIdent.parent = logicalExpr;

      const visitor = rule.create(context);
      if (visitor.AwaitExpression) {
        (visitor.AwaitExpression as (node: AwaitExpression) => void)(awaitExpr);
      }

      expect(context.reports.length).toBe(1);
      const report = context.reports[0]!;
      expect(report.fix).toBeDefined();

      if (report.fix) {
        const fixer = {
          replaceText: (node: BaseNode, text: string) => ({
            range: node.range as [number, number],
            text,
          }),
        };
        const fixResult = report.fix(fixer);
        // The fix should include || defaultValue inside the .then() callback
        expect(fixResult.text).toBe("await getData().then((r) => r.value || defaultValue)");
      }
    });
  });
});
