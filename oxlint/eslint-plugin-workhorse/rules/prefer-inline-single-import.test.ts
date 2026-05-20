import { describe, expect, it } from "vitest";

import rule from "./prefer-inline-single-import.ts";

describe("prefer-inline-single-import", () => {
  it("has correct meta information", () => {
    expect(rule.meta.type).toBe("suggestion");
    expect(rule.meta.messages.preferColocate).toContain("only imported by");
  });

  it("creates a visitor with Program handlers", () => {
    const mockContext = {
      filename: "/project/src/tool-renderer.ts",
      report: () => {},
    };

    const visitor = rule.create(mockContext);
    expect(typeof visitor.Program).toBe("function");
    expect(typeof visitor["Program:exit"]).toBe("function");
  });

  it("skips index files", () => {
    const mockContext = {
      filename: "/project/src/index.ts",
      report: () => {},
    };

    const visitor = rule.create(mockContext);
    expect(visitor).toEqual({});
  });

  it("skips test files", () => {
    const mockContext = {
      filename: "/project/src/renderer.test.ts",
      report: () => {},
    };

    const visitor = rule.create(mockContext);
    expect(visitor).toEqual({});
  });

  it("skips types.ts files", () => {
    const mockContext = {
      filename: "/project/src/types.ts",
      report: () => {},
    };

    const visitor = rule.create(mockContext);
    expect(visitor).toEqual({});
  });

  it("skips non-TypeScript files", () => {
    const mockContext = {
      filename: "/project/src/config.json",
      report: () => {},
    };

    const visitor = rule.create(mockContext);
    expect(visitor).toEqual({});
  });

  it("message format includes newName placeholder", () => {
    expect(rule.meta.messages.preferColocate).toContain("{{newName}}");
  });

  it("suggests folder/newName format", () => {
    expect(rule.meta.messages.preferColocate).toContain("{{baseName}}/{{newName}}");
  });

  it("has removeParentPrefix message", () => {
    expect(rule.meta.messages.removeParentPrefix).toContain("parent folder name");
    expect(rule.meta.messages.removeParentPrefix).toContain("{{parentName}}");
    expect(rule.meta.messages.removeParentPrefix).toContain("{{newName}}");
  });
});
