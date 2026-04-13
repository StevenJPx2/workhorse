import { describe, it, expect } from "bun:test";
import rule from "./prefer-composables-over-props";

function createContext() {
  const reports: Array<{ message: string; loc: { line: number; column: number } }> = [];
  let handlerPropCount = 0;

  return {
    report: (data: { message: string; loc: { line: number; column: number } }) => {
      reports.push(data);
    },
    reports,
    resetCounter() {
      handlerPropCount = 0;
    },
  };
}

describe("prefer-composables-over-props", () => {
  it("should not report components with few handler props", () => {
    const context = createContext();
    const visitor = rule.create(context);

    const handlerProps = [
      { name: { type: "JSXIdentifier", name: "onClick" } },
      { name: { type: "JSXIdentifier", name: "onChange" } },
    ];

    handlerProps.forEach((prop) => {
      if (visitor.JSXAttribute) {
        visitor.JSXAttribute(prop);
      }
    });

    if (visitor["Program:exit"]) {
      visitor["Program:exit"]();
    }

    expect(context.reports.length).toBe(0);
  });

  it("should report when handler props exceed 5", () => {
    const context = createContext();
    const visitor = rule.create(context);

    const handlerProps = [
      { name: { type: "JSXIdentifier", name: "onClick" } },
      { name: { type: "JSXIdentifier", name: "onChange" } },
      { name: { type: "JSXIdentifier", name: "onSubmit" } },
      { name: { type: "JSXIdentifier", name: "onFocus" } },
      { name: { type: "JSXIdentifier", name: "onBlur" } },
      { name: { type: "JSXIdentifier", name: "onKeyDown" } },
    ];

    handlerProps.forEach((prop) => {
      if (visitor.JSXAttribute) {
        visitor.JSXAttribute(prop);
      }
    });

    if (visitor["Program:exit"]) {
      visitor["Program:exit"]();
    }

    expect(context.reports.length).toBe(1);
    expect(context.reports[0].message).toContain("6 handler props");
  });

  it("should not report exactly 5 handler props", () => {
    const context = createContext();
    const visitor = rule.create(context);

    const handlerProps = [
      { name: { type: "JSXIdentifier", name: "onClick" } },
      { name: { type: "JSXIdentifier", name: "onChange" } },
      { name: { type: "JSXIdentifier", name: "onSubmit" } },
      { name: { type: "JSXIdentifier", name: "onFocus" } },
      { name: { type: "JSXIdentifier", name: "onBlur" } },
    ];

    handlerProps.forEach((prop) => {
      if (visitor.JSXAttribute) {
        visitor.JSXAttribute(prop);
      }
    });

    if (visitor["Program:exit"]) {
      visitor["Program:exit"]();
    }

    expect(context.reports.length).toBe(0);
  });

  it("should only count handler props (on* pattern)", () => {
    const context = createContext();
    const visitor = rule.create(context);

    const allProps = [
      { name: { type: "JSXIdentifier", name: "className" } },
      { name: { type: "JSXIdentifier", name: "id" } },
      { name: { type: "JSXIdentifier", name: "onClick" } },
      { name: { type: "JSXIdentifier", name: "onChange" } },
    ];

    allProps.forEach((prop) => {
      if (visitor.JSXAttribute) {
        visitor.JSXAttribute(prop);
      }
    });

    if (visitor["Program:exit"]) {
      visitor["Program:exit"]();
    }

    expect(context.reports.length).toBe(0);
  });
});
