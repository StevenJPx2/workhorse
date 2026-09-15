// Stub synthesis. This is what makes discovery survive a run() that branches on
// its stage output — and the two polarities are the whole mechanism, so each
// scalar kind's low/high pair is asserted rather than assumed.

import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { POLARITIES, stubFromSchema } from "../stub";

describe("scalars", () => {
  it("gives strings empty vs non-empty", () => {
    expect(stubFromSchema(v.string(), "low")).toBe("");
    expect(stubFromSchema(v.string(), "high")).toBe("stub");
  });

  it("gives numbers 0 vs 1", () => {
    // 0 vs 1 matters: `if (todosRemaining <= 0) break` takes opposite branches.
    expect(stubFromSchema(v.number(), "low")).toBe(0);
    expect(stubFromSchema(v.number(), "high")).toBe(1);
  });

  it("gives booleans false vs true", () => {
    expect(stubFromSchema(v.boolean(), "low")).toBe(false);
    expect(stubFromSchema(v.boolean(), "high")).toBe(true);
  });

  it("returns null for a schema kind it does not model", () => {
    // Unknown kinds must not throw — an unrecognized field should never make a
    // whole workflow undiscoverable.
    expect(stubFromSchema(v.blob(), "low")).toBeNull();
  });

  it("returns null for a non-schema", () => {
    expect(stubFromSchema(undefined)).toBeNull();
    expect(stubFromSchema("not a schema")).toBeNull();
  });
});

describe("objects", () => {
  it("fills every declared entry", () => {
    const s = v.object({ a: v.string(), b: v.number(), c: v.boolean() });
    expect(stubFromSchema(s, "high")).toEqual({ a: "stub", b: 1, c: true });
  });

  it("nests", () => {
    const s = v.object({ control: v.object({ verdict: v.string() }), analysis: v.string() });
    expect(stubFromSchema(s, "low")).toEqual({ control: { verdict: "" }, analysis: "" });
  });

  it("handles an empty object", () => {
    expect(stubFromSchema(v.object({}), "low")).toEqual({});
  });
});

describe("arrays", () => {
  it("is empty under low and populated under high", () => {
    const s = v.array(v.object({ id: v.string() }));

    // The pair is what makes a `for (const todo of todos)` body both skipped and
    // entered across the two passes.
    expect(stubFromSchema(s, "low")).toEqual([]);
    // One element is all a loop body needs to be entered.
    expect(stubFromSchema(s, "high")).toHaveLength(1);
  });

  it("stubs the element shape under high", () => {
    const s = v.array(v.object({ id: v.string(), n: v.number() }));
    expect(stubFromSchema(s, "high")).toEqual([{ id: "stub", n: 1 }]);
  });
});

describe("picklists", () => {
  it("takes opposite ends of the option list", () => {
    const s = v.picklist(["pass", "fail"]);

    // A reviewer's verdict is the canonical case: both routes must be reachable.
    expect(stubFromSchema(s, "low")).toBe("pass");
    expect(stubFromSchema(s, "high")).toBe("fail");
  });

  it("handles a single option", () => {
    expect(stubFromSchema(v.picklist(["only"]), "low")).toBe("only");
    expect(stubFromSchema(v.picklist(["only"]), "high")).toBe("only");
  });
});

describe("wrappers", () => {
  it("omits an optional under low and fills it under high", () => {
    const s = v.optional(v.string());

    // An optional field gates a branch as often as a boolean does.
    expect(stubFromSchema(s, "low")).toBeUndefined();
    expect(stubFromSchema(s, "high")).toBe("stub");
  });

  it("unwraps nullable and nullish", () => {
    expect(stubFromSchema(v.nullable(v.number()), "high")).toBe(1);
    expect(stubFromSchema(v.nullish(v.boolean()), "high")).toBe(true);
  });

  it("respects a declared default over any invented value", () => {
    // An author-provided default is better information than our heuristic.
    expect(stubFromSchema(v.optional(v.string(), "given"), "low")).toBe("given");
    expect(stubFromSchema(v.optional(v.number(), 42), "high")).toBe(42);
  });

  it("takes opposite union arms", () => {
    const s = v.union([v.string(), v.number()]);
    expect(stubFromSchema(s, "low")).toBe("");
    expect(stubFromSchema(s, "high")).toBe(1);
  });

  it("returns literals verbatim under both polarities", () => {
    expect(stubFromSchema(v.literal("x"), "low")).toBe("x");
    expect(stubFromSchema(v.literal("x"), "high")).toBe("x");
  });
});

describe("polarity ordering", () => {
  it("walks low before high", () => {
    // Deterministic order keeps discovery's first-seen stage ordering stable,
    // which is what the graph view reads as the pipeline's reading order.
    expect(POLARITIES).toEqual(["low", "high"]);
  });
});

describe("a realistic stage schema", () => {
  it("produces a fully navigable object under both polarities", () => {
    const IMPL = v.object({
      control: v.object({
        todoId: v.optional(v.string()),
        uiChanges: v.boolean(),
        todosRemaining: v.number(),
        blocking: v.array(v.object({ file: v.string(), problem: v.string() })),
      }),
      analysis: v.string(),
    });

    for (const p of POLARITIES) {
      const out = stubFromSchema(IMPL, p) as { control: Record<string, unknown>; analysis: string };

      // Every property access a run() might make must resolve without throwing.
      expect(typeof out.control.uiChanges).toBe("boolean");
      expect(typeof out.control.todosRemaining).toBe("number");
      expect(Array.isArray(out.control.blocking)).toBe(true);
      expect(typeof out.analysis).toBe("string");
    }
  });
});
