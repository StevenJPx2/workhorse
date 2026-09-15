// Graph discovery. The claim under test is that running run() against stub data
// recovers the pipeline's real shape — including the branches and loops a single
// pass would miss. Every case here is a shape a real workflow has.

import { agent } from "@workhorse/api";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { type DiscoveryContext, discoverGraph } from "../discover";

const OUT = (control: Record<string, v.GenericSchema> = {}) =>
  v.object({ control: v.object(control), analysis: v.string() });

const enrich = agent({ name: "enrich", instructions: "brief it", output: OUT() });
const plan = agent({
  name: "plan",
  instructions: "decompose",
  output: OUT({ todos: v.array(v.object({ id: v.string() })) }),
});
const implement = agent({
  name: "implement",
  instructions: "code",
  output: OUT({ uiChanges: v.boolean(), todosRemaining: v.number() }),
});
const review = agent({
  name: "review",
  instructions: "review",
  output: OUT({ verdict: v.picklist(["pass", "fail"]) }),
});
const writeText = agent({ name: "pr-write", instructions: "body", output: OUT() });
const writeVisual = agent({ name: "pr-write-visual", instructions: "body+shots", output: OUT() });

describe("linear pipelines", () => {
  it("records stages in first-observed order", async () => {
    const g = await discoverGraph(async (ctx) => {
      const a = await ctx.run(enrich);
      const b = await ctx.run(plan, { upstream: [a] });
      await ctx.run(implement, { upstream: [b] });
      return { outcome: "pr" as const };
    });

    expect(g.stages.map((s) => s.id)).toEqual(["enrich", "plan", "implement"]);
  });

  it("derives edges from upstream, not from call order", async () => {
    const g = await discoverGraph(async (ctx) => {
      const a = await ctx.run(enrich);
      const b = await ctx.run(plan);
      // implement depends on BOTH, though neither is its immediate predecessor.
      await ctx.run(implement, { upstream: [a, b] });
      return { outcome: "pr" as const };
    });

    expect(g.edges).toEqual([
      { from: "enrich", to: "implement" },
      { from: "plan", to: "implement" },
    ]);
  });

  it("records no edge for a stage with no upstream", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(enrich);
      return { outcome: "pr" as const };
    });

    expect(g.edges).toEqual([]);
    expect(g.stages).toHaveLength(1);
  });

  it("exposes the agent instance, not just its name", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(enrich);
      return { outcome: "pr" as const };
    });

    // Tool gating and the graph view both need the agent itself.
    expect(g.stages[0].agent).toBe(enrich);
    expect(g.stages[0].agent.instructions).toBe("brief it");
  });
});

describe("branches — the reason there are two passes", () => {
  it("finds BOTH arms of a boolean branch", async () => {
    const g = await discoverGraph(async (ctx) => {
      const impl = await ctx.run(implement);
      await ctx.run(impl.control.uiChanges ? writeVisual : writeText, { upstream: [impl] });
      return { outcome: "pr" as const };
    });

    // A single pass would report exactly one of these, and the graph would be
    // quietly wrong about what the workflow can do.
    expect(g.stages.map((s) => s.id).sort()).toEqual(["implement", "pr-write", "pr-write-visual"]);
  });

  it("finds both arms of a picklist verdict", async () => {
    const g = await discoverGraph(async (ctx) => {
      const r = await ctx.run(review);
      if (r.control.verdict === "fail") await ctx.run(implement, { upstream: [r] });
      else await ctx.run(writeText, { upstream: [r] });
      return { outcome: "pr" as const };
    });

    expect(g.stages.map((s) => s.id).sort()).toEqual(["implement", "pr-write", "review"]);
  });

  it("enters an array-driven loop body under the high polarity", async () => {
    const g = await discoverGraph(async (ctx) => {
      const p = await ctx.run(plan);
      const todos = (p.control.todos ?? []) as unknown[];
      for (const _ of todos) await ctx.run(implement, { upstream: [p] });
      return { outcome: "pr" as const };
    });

    // Under "low" the todos array is empty and the body never runs; "high" is
    // what makes the loop body visible at all.
    expect(g.stages.map((s) => s.id)).toContain("implement");
  });

  it("unions edges across passes rather than keeping the last", async () => {
    const g = await discoverGraph(async (ctx) => {
      const impl = await ctx.run(implement);
      if (impl.control.uiChanges) await ctx.run(writeVisual, { upstream: [impl] });
      else await ctx.run(writeText, { upstream: [impl] });
      return { outcome: "pr" as const };
    });

    expect(g.edges).toEqual([
      { from: "implement", to: "pr-write" },
      { from: "implement", to: "pr-write-visual" },
    ]);
  });
});

describe("loops", () => {
  it("flags a stage invoked more than once in one pass", async () => {
    const g = await discoverGraph(async (ctx) => {
      let r = await ctx.run(review);
      for (let i = 0; i < 2 && r.control.verdict === "fail"; i++) {
        await ctx.run(implement);
        r = await ctx.run(review);
      }
      return { outcome: "pr" as const };
    });

    // "fail" is the high-polarity value, so the retry arm runs and review repeats.
    expect(g.loops).toContain("review");
    expect(g.stages.find((s) => s.id === "review")?.repeated).toBe(true);
  });

  it("does not flag a stage that merely appears in both passes", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(enrich);
      return { outcome: "pr" as const };
    });

    // Two passes visit enrich once each; that is not a loop.
    expect(g.loops).toEqual([]);
    expect(g.stages[0].repeated).toBe(false);
  });

  it("aborts a stub-unbounded loop instead of hanging", async () => {
    const g = await discoverGraph(async (ctx) => {
      // No stub value terminates this, which is exactly the failure the
      // invocation cap exists for.
      for (;;) await ctx.run(implement);
    });

    // The throw is swallowed per pass, so the stage it did observe survives.
    expect(g.stages.map((s) => s.id)).toEqual(["implement"]);
  });
});

describe("inputs", () => {
  it("collects input keys across invocations", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(writeText, { input: { uiChanges: true } });
      await ctx.run(writeText, { input: { todoId: "t1" } });
      return { outcome: "pr" as const };
    });

    expect(g.stages[0].inputKeys.sort()).toEqual(["todoId", "uiChanges"]);
  });

  it("reports no input keys when none are passed", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(enrich);
      return { outcome: "pr" as const };
    });

    expect(g.stages[0].inputKeys).toEqual([]);
  });
});

describe("resilience", () => {
  it("keeps what it observed when run() throws", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(enrich);
      throw new Error("workflow rejected stub data");
    });

    // A workflow may legitimately throw on stub values; that says nothing about
    // its graph, and the edges seen before the throw are still true.
    expect(g.stages.map((s) => s.id)).toEqual(["enrich"]);
  });

  it("ignores non-result values passed as upstream", async () => {
    const g = await discoverGraph(async (ctx) => {
      await ctx.run(implement, { upstream: [{ not: "a result" } as never] });
      return { outcome: "pr" as const };
    });

    expect(g.edges).toEqual([]);
  });

  it("seeds runId and task so run() can branch on them", async () => {
    const seen: string[] = [];
    await discoverGraph(
      async (ctx: DiscoveryContext) => {
        seen.push(ctx.runId);
        await ctx.run(enrich);
        return {};
      },
      { runId: "t1" },
    );

    expect(seen[0]).toBe("t1");
  });
});

describe("the seed axis", () => {
  // Stub polarity varies stage OUTPUT. It cannot reach a branch keyed on the run's
  // own identity — and the fleet has exactly such a branch, so this axis is not
  // hypothetical: the Phase 2 gate failed without it, missing the therapist arm
  // entirely.
  const revisionOnly = agent({ name: "therapist", instructions: "collate", output: OUT() });

  it("finds an arm reachable only on a revision run", async () => {
    const g = await discoverGraph(async (ctx) => {
      if (ctx.runId.includes("-rev")) await ctx.run(revisionOnly);
      await ctx.run(enrich);
      return { outcome: "pr" as const };
    });

    expect(g.stages.map((s) => s.id).sort()).toEqual(["enrich", "therapist"]);
  });

  it("records edges that only a revision run creates", async () => {
    const g = await discoverGraph(async (ctx) => {
      const brief = ctx.runId.includes("-rev")
        ? await ctx.run(enrich, { upstream: [await ctx.run(revisionOnly)] })
        : await ctx.run(enrich);
      await ctx.run(plan, { upstream: [brief] });
      return { outcome: "pr" as const };
    });

    expect(g.edges).toContainEqual({ from: "therapist", to: "enrich" });
    expect(g.edges).toContainEqual({ from: "enrich", to: "plan" });
  });

  it("walks every declared extra seed", async () => {
    const special = agent({ name: "special", instructions: "s", output: OUT() });

    const g = await discoverGraph(
      async (ctx) => {
        if (ctx.inputs.mode === "special") await ctx.run(special);
        else await ctx.run(enrich);
        return { outcome: "pr" as const };
      },
      { seeds: [{ inputs: { mode: "special" } }] },
    );

    // A workflow branching on an input the defaults cannot guess declares its own
    // seed rather than going undiscovered.
    expect(g.stages.map((s) => s.id).sort()).toEqual(["enrich", "special"]);
  });

  it("walks base and revision seeds by default", async () => {
    const runIds: string[] = [];
    await discoverGraph(async (ctx) => {
      runIds.push(ctx.runId);
      return { outcome: "pr" as const };
    });

    // 2 seeds x 2 polarities.
    expect(runIds).toHaveLength(4);
    expect(new Set(runIds)).toEqual(new Set(["discover", "discover-rev1"]));
  });
});

describe("stub results", () => {
  it("exposes control and analysis accessors, not just output", async () => {
    let shape: unknown;
    await discoverGraph(async (ctx) => {
      shape = await ctx.run(implement);
      return { outcome: "pr" as const };
    });

    // Existing run() bodies read r.control.x and r.analysis directly; a stub
    // lacking them would throw on property access rather than route.
    const r = shape as { control: Record<string, unknown>; analysis: string; output: unknown };
    expect(typeof r.control.uiChanges).toBe("boolean");
    expect(typeof r.analysis).toBe("string");
    expect(r.output).toBeTypeOf("object");
  });
});
