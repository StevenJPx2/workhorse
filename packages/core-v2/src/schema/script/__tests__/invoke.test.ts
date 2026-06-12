import { describe, expect, it } from "vitest";

import { defineScript } from "../define";
import { resolveInvocation } from "../invoke";

const script = defineScript({
  args: {
    options: [
      { description: "Output dir", name: "out", required: true },
      { default: "info", description: "Log level", name: "level" },
    ],
    positional: [
      { description: "Source file", name: "src", required: true },
      { default: "main", description: "Branch", name: "branch" },
    ],
  },
  command: "echo hi",
  description: "Demo",
  name: "demo",
});

describe("resolveInvocation", () => {
  it("applies defaults for omitted positionals and options", () => {
    const result = resolveInvocation(script, {
      options: { out: "dist" },
      positional: ["a.ts"],
    });
    expect(result.positional).toEqual(["a.ts", "main"]);
    expect(result.options).toEqual({ level: "info", out: "dist" });
  });

  it("passes through provided values over defaults", () => {
    const result = resolveInvocation(script, {
      options: { level: "debug", out: "dist" },
      positional: ["a.ts", "dev"],
    });
    expect(result.positional).toEqual(["a.ts", "dev"]);
    expect(result.options.level).toBe("debug");
  });

  it("throws on a missing required positional", () => {
    expect(() =>
      resolveInvocation(script, { options: { out: "dist" } }),
    ).toThrow(/Missing required argument "src"/u);
  });

  it("throws on a missing required option", () => {
    expect(() => resolveInvocation(script, { positional: ["a.ts"] })).toThrow(
      /Missing required option "out"/u,
    );
  });

  it("throws on an unknown option", () => {
    expect(() =>
      resolveInvocation(script, {
        options: { nope: "x", out: "dist" },
        positional: ["a.ts"],
      }),
    ).toThrow(/Unknown option "nope"/u);
  });

  it("returns empty values for an omitted optional positional with no default", () => {
    const bare = defineScript({
      args: { options: [], positional: [{ description: "X", name: "x" }] },
      command: "echo hi",
      description: "Bare",
      name: "bare",
    });
    expect(resolveInvocation(bare, {}).positional).toEqual([""]);
  });
});
