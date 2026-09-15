// workflow() — the builder. What matters: the graph is derived (not declared),
// discovery is lazy and memoized, and run() is passed through untouched so the
// real engine drives the same function discovery inspected.

import { agent } from "@workhorse/api";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import { workflow } from "../workflow";

const OUT = (control: Record<string, v.GenericSchema> = {}) =>
  v.object({ control: v.object(control), analysis: v.string() });

/** Discovery walks seeds x polarities: (base, -rev) x (low, high). */
const PASSES = 4;

const a1 = agent({ name: "one", instructions: "first", output: OUT() });
const a2 = agent({ name: "two", instructions: "second", output: OUT() });

describe("declaration", () => {
  it("keeps the metadata it was given", () => {
    const w = workflow({
      name: "demo",
      description: "a demo",
      model: "anthropic/sonnet",
      inputs: [{ name: "target", type: "string", required: true }],
      run: async () => ({ outcome: "pr" }),
    });

    expect(w.name).toBe("demo");
    expect(w.description).toBe("a demo");
    expect(w.model).toBe("anthropic/sonnet");
    expect(w.inputs?.[0].name).toBe("target");
  });

  it("is frozen", () => {
    const w = workflow({ name: "demo", run: async () => ({ outcome: "pr" }) });

    expect(Object.isFrozen(w)).toBe(true);
  });

  it("passes run() through unchanged", async () => {
    const run = vi.fn(async () => ({ outcome: "report" as const, summary: "done" }));
    const w = workflow({ name: "demo", run });

    // The engine must drive the SAME function discovery walked; wrapping it would
    // make the graph describe something other than what executes.
    expect(w.run).toBe(run);
    expect(await w.run({} as never)).toEqual({ outcome: "report", summary: "done" });
  });
});

describe("derived graph", () => {
  it("discovers stages from run()", async () => {
    const w = workflow({
      name: "demo",
      async run(ctx) {
        const r = await ctx.run(a1);
        await ctx.run(a2, { upstream: [r] });
        return { outcome: "pr" };
      },
    });

    const g = await w.graph();
    expect(g.stages.map((s) => s.id)).toEqual(["one", "two"]);
    expect(g.edges).toEqual([{ from: "one", to: "two" }]);
  });

  it("exposes the agents the graph reached", async () => {
    const w = workflow({
      name: "demo",
      async run(ctx) {
        await ctx.run(a1);
        await ctx.run(a2);
        return { outcome: "pr" };
      },
    });

    expect(await w.agents()).toEqual([a1, a2]);
  });

  it("reports an empty graph for a workflow that runs no agent", async () => {
    const w = workflow({ name: "noop", run: async () => ({ outcome: "report" }) });
    const g = await w.graph();

    expect(g.stages).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it("seeds the discovery runId from the workflow name", async () => {
    const seen: string[] = [];
    const w = workflow({
      name: "coding",
      async run(ctx) {
        seen.push(ctx.runId);
        return { outcome: "pr" };
      },
    });

    await w.graph();
    expect(seen[0]).toBe("coding-discover");
  });
});

describe("laziness and memoization", () => {
  it("does not run discovery at declaration time", () => {
    const run = vi.fn(async () => ({ outcome: "pr" as const }));
    workflow({ name: "demo", run });

    // workflow() is called at module load; discovering there would make importing
    // a workflow package cost two full run() passes even when nothing asks.
    expect(run).not.toHaveBeenCalled();
  });

  it("runs discovery once per seed x polarity on first graph()", async () => {
    const run = vi.fn(async () => ({ outcome: "pr" as const }));
    const w = workflow({ name: "demo", run });

    await w.graph();

    // Two seeds (base + `-rev`) x two polarities. The seed axis exists because a
    // workflow branching on ctx.runId hides a whole arm under one identity.
    expect(run).toHaveBeenCalledTimes(PASSES);
  });

  it("memoizes across repeated graph() calls", async () => {
    const run = vi.fn(async () => ({ outcome: "pr" as const }));
    const w = workflow({ name: "demo", run });

    await w.graph();
    await w.graph();
    await w.graph();

    expect(run).toHaveBeenCalledTimes(PASSES);
  });

  it("shares one discovery between concurrent callers", async () => {
    const run = vi.fn(async () => ({ outcome: "pr" as const }));
    const w = workflow({ name: "demo", run });

    // Caching the PROMISE rather than the value is what prevents two racing
    // callers from each paying for a full discovery.
    await Promise.all([w.graph(), w.graph(), w.graph()]);
    expect(run).toHaveBeenCalledTimes(PASSES);
  });

  it("serves agents() from the same cached graph", async () => {
    const run = vi.fn(async (ctx: { run: (a: typeof a1) => Promise<unknown> }) => {
      await ctx.run(a1);
      return { outcome: "pr" as const };
    });
    const w = workflow({ name: "demo", run: run as never });

    await w.graph();
    await w.agents();

    expect(run).toHaveBeenCalledTimes(PASSES);
  });
});

describe("branching workflows", () => {
  it("discovers both arms without executing a model", async () => {
    const visual = agent({ name: "visual", instructions: "v", output: OUT() });
    const text = agent({ name: "text", instructions: "t", output: OUT() });
    const impl = agent({ name: "impl", instructions: "i", output: OUT({ uiChanges: v.boolean() }) });

    const w = workflow({
      name: "demo",
      async run(ctx) {
        const r = await ctx.run(impl);
        await ctx.run(r.control.uiChanges ? visual : text, { upstream: [r] });
        return { outcome: "pr" };
      },
    });

    const g = await w.graph();
    expect(g.stages.map((s) => s.id).sort()).toEqual(["impl", "text", "visual"]);
    expect(g.edges).toHaveLength(2);
  });
});
