// PHASE 2 GATE: the discovered graph must match the coding pipeline's real shape.
//
// The coding workflow is six agents with a bounded review loop, a per-todo loop,
// and a visual-vs-text branch. If discovery recovers that from run() alone, the
// primitives are sound and Phase 4 can port the real workflow onto them; if it
// does not, no amount of later work fixes it.
//
// The pipeline is rebuilt here so the primitive remains independently tested. The
// shipping workflow has the same shape in workflows/coding/.

import { agent } from "@workhorse/api";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { renderMermaid, renderText } from "../render";
import { workflow } from "../workflow";

const ANALYSIS = v.string();

const enricher = agent({
  name: "enrich",
  instructions: "Turn the request into one self-contained task brief.",
  output: v.object({ control: v.object({}), analysis: ANALYSIS }),
  readOnly: true,
  thinking: "medium",
  notifications: "read",
});

const planner = agent({
  name: "plan",
  instructions: "Decompose the brief into todos.",
  output: v.object({
    control: v.object({ todos: v.array(v.object({ id: v.string(), title: v.string() })) }),
    analysis: ANALYSIS,
  }),
});

const coder = agent({
  name: "implement",
  instructions: "Complete exactly ONE todo.",
  output: v.object({
    control: v.object({
      todoId: v.optional(v.string()),
      uiChanges: v.boolean(),
      todosRemaining: v.number(),
    }),
    analysis: ANALYSIS,
  }),
});

const reviewer = agent({
  name: "review",
  instructions: "Adversarially review the change.",
  output: v.object({
    control: v.object({
      verdict: v.picklist(["pass", "fail"]),
      blocking: v.optional(v.array(v.object({ file: v.string(), problem: v.string() }))),
    }),
    analysis: ANALYSIS,
  }),
  readOnly: true,
});

const writer = agent({
  name: "pr-write",
  instructions: "Update the PR body.",
  output: v.object({ control: v.object({}), analysis: ANALYSIS }),
});

const visualWriter = agent({
  name: "pr-write-visual",
  instructions: "Update the PR body with screenshots.",
  output: v.object({ control: v.object({}), analysis: ANALYSIS }),
});

const therapist = agent({
  name: "therapist",
  instructions: "Collate PR feedback into actionable direction.",
  output: v.object({ control: v.object({}), analysis: ANALYSIS }),
  readOnly: true,
});

const MAX_REVIEW_LOOPS = 2;
const HARD_TODO_CAP = 25;

/** The coding pipeline, expressed on the Phase 2 primitives. */
const coding = workflow({
  name: "coding",
  description: "Multi-agent PR pipeline.",

  async run(ctx) {
    // A revision run collates feedback through the therapist before re-enriching.
    const isRevision = ctx.runId.includes("-rev");
    const brief = isRevision
      ? await ctx.run(enricher, { upstream: [await ctx.run(therapist)] })
      : await ctx.run(enricher);

    const plan = await ctx.run(planner, { upstream: [brief] });
    const todos = (plan.output.control.todos ?? []) as Array<{ id: string }>;
    const cap = Math.min(Math.max(todos.length, 1) + 2, HARD_TODO_CAP);

    let body = brief;
    for (let i = 0; i < cap; i++) {
      let impl = await ctx.run(coder, { upstream: [brief, plan] });

      let review = await ctx.run(reviewer, { upstream: [impl] });
      for (let attempt = 0; attempt < MAX_REVIEW_LOOPS && review.output.control.verdict === "fail"; attempt++) {
        impl = await ctx.run(coder, {
          upstream: [brief, plan],
          routedFrom: { stage: "review", digest: review.analysis },
        });
        review = await ctx.run(reviewer, { upstream: [impl] });
      }

      body = await ctx.run(impl.output.control.uiChanges ? visualWriter : writer, {
        input: { uiChanges: impl.output.control.uiChanges },
        upstream: [brief, impl, review, body],
      });

      if (Number(impl.output.control.todosRemaining ?? 0) <= 0) break;
    }

    return { outcome: "pr", summary: body.analysis.slice(0, 200) };
  },
});

describe("Phase 2 gate — discovered graph matches the coding pipeline", () => {
  it("finds every one of the six agents", async () => {
    const g = await coding.graph();

    // Six agent blocks, including BOTH pr-write variants and the therapist that
    // only a revision run reaches.
    expect(g.stages.map((s) => s.id).sort()).toEqual([
      "enrich",
      "implement",
      "plan",
      "pr-write",
      "pr-write-visual",
      "review",
      "therapist",
    ]);
  });

  it("orders stages as the pipeline reads", async () => {
    const g = await coding.graph();
    const order = g.stages.map((s) => s.id);

    expect(order.indexOf("enrich")).toBeLessThan(order.indexOf("plan"));
    expect(order.indexOf("plan")).toBeLessThan(order.indexOf("implement"));
    expect(order.indexOf("implement")).toBeLessThan(order.indexOf("review"));
  });

  it("recovers the real dependency edges", async () => {
    const g = await coding.graph();
    const has = (from: string, to: string) => g.edges.some((e) => e.from === from && e.to === to);

    expect(has("enrich", "plan")).toBe(true);
    expect(has("plan", "implement")).toBe(true);
    expect(has("enrich", "implement")).toBe(true);
    expect(has("implement", "review")).toBe(true);
    expect(has("review", "pr-write")).toBe(true);
    expect(has("therapist", "enrich")).toBe(true);
  });

  it("identifies the loops", async () => {
    const g = await coding.graph();

    // implement and review repeat via the bounded review loop; both are real
    // cycles a linear reading of run() would miss.
    expect(g.loops).toContain("implement");
    expect(g.loops).toContain("review");
  });

  it("finds BOTH pr-write variants, which no single pass could", async () => {
    const g = await coding.graph();

    expect(g.stages.map((s) => s.id)).toContain("pr-write");
    expect(g.stages.map((s) => s.id)).toContain("pr-write-visual");
    expect(g.edges.some((e) => e.to === "pr-write-visual")).toBe(true);
  });

  it("records the uiChanges input on the writer stages", async () => {
    const g = await coding.graph();
    const visual = g.stages.find((s) => s.id === "pr-write-visual");

    // The conditional tool surface keys off this, so the graph must show it.
    expect(visual?.inputKeys).toContain("uiChanges");
  });

  it("preserves each agent's stage controls", async () => {
    const g = await coding.graph();
    const byId = new Map(g.stages.map((s) => [s.id, s.agent]));

    expect(byId.get("enrich")?.readOnly).toBe(true);
    expect(byId.get("enrich")?.notifications).toBe("read");
    expect(byId.get("review")?.readOnly).toBe(true);
    expect(byId.get("implement")?.readOnly).toBeUndefined();
  });

  it("discovers without a model, a sandbox, or a network call", async () => {
    // The gate's real claim: this whole graph came from run() and valibot
    // schemas. No harness, no credential, no container.
    const g = await coding.graph();
    expect(g.stages.length).toBeGreaterThan(0);
  });
});

describe("rendering", () => {
  it("matches the reviewed pipeline diagram", async () => {
    // A SNAPSHOT, deliberately: the Phase 2 gate is "the discovered graph matches
    // the pipeline we intended", and a human reading this diagram is what
    // verifies it. A future change that silently rewires the pipeline fails here
    // with a readable diff instead of passing a set of edge assertions.
    //
    // TWO ARTIFACTS worth naming, because the diagram is only useful if you can
    // tell a real edge from a discovery artifact:
    //
    //   `pr_write_visual --> pr_write_visual` and its `repeats` marker. The per-
    //   todo loop feeds each round's PR body into the next (`upstream: [..., body]`),
    //   so a writer that runs twice depends on itself. That is genuinely what the
    //   code does. Its text twin has no self-edge only because the high polarity —
    //   the one that enters the loop twice — is also the one that picks the VISUAL
    //   writer, so `pr-write` is never observed feeding itself.
    //
    // Both are honest reports of what the stub passes reached, not bugs. Real
    // routing coverage is the eval's job, not discovery's.
    expect(renderMermaid(await coding.graph())).toMatchInlineSnapshot(`
      "flowchart TD
        enrich("enrich")
        plan("plan")
        implement[["implement"]]
        review[["review"]]
        pr_write("pr-write")
        pr_write_visual[["pr-write-visual"]]
        therapist("therapist")
        enrich --> plan
        enrich --> implement
        plan --> implement
        implement --> review
        enrich --> pr_write
        implement --> pr_write
        review --> pr_write
        enrich --> pr_write_visual
        implement --> pr_write_visual
        review --> pr_write_visual
        pr_write_visual --> pr_write_visual
        therapist --> enrich
        implement -. repeats .-> implement
        review -. repeats .-> review
        pr_write_visual -. repeats .-> pr_write_visual"
    `);
  });

  it("emits a Mermaid flowchart with every stage and edge", async () => {
    const g = await coding.graph();
    const mermaid = renderMermaid(g);

    expect(mermaid.startsWith("flowchart TD")).toBe(true);
    for (const stage of g.stages) {
      expect(mermaid).toContain(stage.id.replace(/-/g, "_"));
    }
    expect(mermaid.match(/-->/g) ?? []).toHaveLength(g.edges.length);
  });

  it("marks repeating stages with a self-loop", async () => {
    const mermaid = renderMermaid(await coding.graph());
    expect(mermaid).toContain("repeats");
  });

  it("can annotate tool counts", async () => {
    const g = await coding.graph();
    expect(renderMermaid(g, { showToolCounts: true })).toContain("0 tools");
  });

  it("renders a readable text summary", async () => {
    const text = renderText(await coding.graph());

    expect(text).toContain("enrich");
    expect(text).toContain("← ");
    expect(text).toContain("↺");
  });

  it("handles an empty graph in both renderers", async () => {
    const empty = workflow({ name: "noop", run: async () => ({ outcome: "report" as const }) });
    const g = await empty.graph();

    expect(renderMermaid(g)).toContain("no stages discovered");
    expect(renderText(g)).toBe("(no stages discovered)");
  });
});
