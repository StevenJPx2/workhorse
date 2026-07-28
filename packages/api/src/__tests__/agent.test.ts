// agent() — the authoring primitive. Small surface, but two things matter: the
// model-policy normalization (fallback and promotion are different axes) and the
// conditional tool surface.

import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { agent } from "../agent";
import { tool } from "../plugin";

const OUT = v.object({ control: v.object({}), analysis: v.string() });

const t = (name: string) =>
  tool({
    name,
    description: `${name} tool`,
    docs: `${name} docs`,
    input: v.object({}),
    run: async () => "ok",
  });

const read = t("read");
const grep = t("grep");
const screenshot = t("browser_screenshot");

describe("basics", () => {
  it("keeps name, instructions, and output", () => {
    const a = agent({ name: "coder", instructions: "write code", output: OUT });

    expect(a.name).toBe("coder");
    expect(a.instructions).toBe("write code");
    expect(a.output).toBe(OUT);
  });

  it("carries the optional stage controls", () => {
    const a = agent({
      name: "reviewer",
      instructions: "review",
      output: OUT,
      thinking: "high",
      readOnly: true,
      writeAllow: ["src/**"],
      notifications: "read",
    });

    expect(a.thinking).toBe("high");
    expect(a.readOnly).toBe(true);
    expect(a.writeAllow).toEqual(["src/**"]);
    expect(a.notifications).toBe("read");
  });

  it("is frozen", () => {
    const a = agent({ name: "coder", instructions: "x", output: OUT });

    // Agents are shared across invocations and workflows; a stage mutating one
    // would silently change another's behaviour.
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => {
      (a as { name: string }).name = "hacked";
    }).toThrow();
  });
});

describe("model policy", () => {
  it("treats a bare string as the primary", () => {
    const a = agent({ name: "c", instructions: "x", output: OUT, model: "anthropic/sonnet" });

    expect(a.model).toEqual({ primary: "anthropic/sonnet" });
  });

  it("keeps a full policy as given", () => {
    const policy = {
      primary: "anthropic/sonnet",
      fallback: ["opencode/sonnet", "bedrock/sonnet"],
      promote: { to: "anthropic/opus", when: { tokenBudget: 120_000, retriesWithoutSubmit: 2 } },
    };
    const a = agent({ name: "c", instructions: "x", output: OUT, model: policy });

    expect(a.model).toEqual(policy);
  });

  it("leaves model undefined when unset, so the workflow default applies", () => {
    expect(agent({ name: "c", instructions: "x", output: OUT }).model).toBeUndefined();
  });

  it("keeps fallback and promote separable", () => {
    const a = agent({
      name: "c",
      instructions: "x",
      output: OUT,
      model: { primary: "p", fallback: ["f"] },
    });

    // Declaring availability legs must not imply a capability escalation — the
    // two axes are priced differently and triggered differently.
    expect(a.model?.fallback).toEqual(["f"]);
    expect(a.model?.promote).toBeUndefined();
  });
});

describe("tools", () => {
  it("defaults to no tools", () => {
    const a = agent({ name: "c", instructions: "x", output: OUT });
    expect(a.tools({ input: {} })).toEqual([]);
  });

  it("returns a static array unchanged", () => {
    const a = agent({ name: "c", instructions: "x", output: OUT, tools: [read, grep] });
    expect(a.tools({ input: {} })).toEqual([read, grep]);
  });

  it("resolves a function form against the invocation input", () => {
    const a = agent({
      name: "pr-writer",
      instructions: "x",
      output: OUT,
      tools: (ctx) => (ctx.input.uiChanges ? [read, screenshot] : [read]),
    });

    // One agent covering a conditional surface, rather than two near-identical
    // agents that drift.
    expect(a.tools({ input: { uiChanges: false } })).toEqual([read]);
    expect(a.tools({ input: { uiChanges: true } })).toEqual([read, screenshot]);
  });

  it("re-evaluates the function on every invocation", () => {
    let calls = 0;
    const a = agent({
      name: "c",
      instructions: "x",
      output: OUT,
      tools: () => {
        calls++;
        return [read];
      },
    });

    a.tools({ input: {} });
    a.tools({ input: {} });
    expect(calls).toBe(2);
  });

  it("exposes tool factories, so names come from the tools themselves", () => {
    const a = agent({ name: "c", instructions: "x", output: OUT, tools: [read, screenshot] });

    // Importing instances rather than naming strings is what makes a typo a
    // compile error instead of an empty allowlist at runtime.
    expect(a.tools({ input: {} }).map((f) => f.toolName)).toEqual(["read", "browser_screenshot"]);
  });
});

describe("output typing", () => {
  it("infers the output type from the schema", () => {
    const schema = v.object({
      control: v.object({ verdict: v.picklist(["pass", "fail"]) }),
      analysis: v.string(),
    });
    const a = agent({ name: "review", instructions: "x", output: schema });

    // The annotation is the assertion: if inference broke, this fails typecheck.
    const parsed: v.InferOutput<typeof a.output> = v.parse(a.output, {
      control: { verdict: "pass" },
      analysis: "looks fine",
    });

    expect(parsed.control.verdict).toBe("pass");
  });

  it("rejects output that violates the schema at runtime", () => {
    const schema = v.object({ control: v.object({ n: v.number() }), analysis: v.string() });
    const a = agent({ name: "c", instructions: "x", output: schema });

    expect(() => v.parse(a.output, { control: { n: "not a number" }, analysis: "" })).toThrow();
  });
});
