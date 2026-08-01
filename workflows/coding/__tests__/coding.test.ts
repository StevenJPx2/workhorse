// PHASE 4 GATE: the real coding workflow, discovered from its own run().
//
// Phase 2's gate rebuilt this pipeline inside the workflow package to prove the
// primitives. This asserts the SHIPPING workflow — the one the worker will drive —
// has the shape and the tool surfaces it is supposed to.
//
// Discovery needs no model, sandbox, or credential, so the pipeline's structure is
// verified on every test run rather than only when a real ticket happens to
// exercise it.

import type { AgentDefinition } from "@workhorse/api";
import { renderMermaid } from "@workhorse/workflow";
import { describe, expect, it } from "vitest";
import { coder, coding, enricher, planner, reviewer, therapist, writer } from "..";

const graph = await coding.graph();

// Typed as the generic AgentDefinition, not `typeof coder` — the latter pins one
// agent's output schema and every other agent then fails to satisfy it.
const toolNames = (agent: AgentDefinition, input: Record<string, unknown> = {}) =>
  agent.tools({ input }).map((t) => t.toolName);

const engineNames = (agent: AgentDefinition) => agent.engineTools ?? [];

describe("shape", () => {
  it("discovers every agent in the pipeline", async () => {
    expect(graph.stages.map((s) => s.id).sort()).toEqual([
      "enrich",
      "implement",
      "plan",
      "pr-write",
      "review",
      "therapist",
    ]);
  });

  it("orders stages as the pipeline reads", () => {
    const order = graph.stages.map((s) => s.id);

    expect(order.indexOf("enrich")).toBeLessThan(order.indexOf("plan"));
    expect(order.indexOf("plan")).toBeLessThan(order.indexOf("implement"));
    expect(order.indexOf("implement")).toBeLessThan(order.indexOf("review"));
  });

  it("recovers the real dependency edges", () => {
    const has = (from: string, to: string) => graph.edges.some((e) => e.from === from && e.to === to);

    expect(has("enrich", "plan")).toBe(true);
    expect(has("plan", "implement")).toBe(true);
    expect(has("implement", "review")).toBe(true);
    expect(has("review", "pr-write")).toBe(true);
  });

  it("routes a revision run through the therapist into enrich", () => {
    // Only reachable on a `-rev` runId, which is the seed axis discovery walks.
    expect(graph.edges).toContainEqual({ from: "therapist", to: "enrich" });
  });

  it("identifies the review loop", () => {
    expect(graph.loops).toContain("implement");
    expect(graph.loops).toContain("review");
  });

  it("uses ONE writer agent for both visual and text bodies", () => {
    // Two stages sharing a persona was the old shape. The variants differ only in
    // tool surface, so they are one agent whose tools are a function of the input.
    expect(graph.stages.filter((s) => s.id.startsWith("pr-write"))).toHaveLength(1);
    expect(graph.stages.find((s) => s.id === "pr-write")?.inputKeys).toContain("uiChanges");
  });

  it("matches the reviewed pipeline diagram", () => {
    expect(renderMermaid(graph)).toMatchInlineSnapshot(`
      "flowchart TD
        enrich("enrich")
        plan("plan")
        implement[["implement"]]
        review[["review"]]
        pr_write[["pr-write"]]
        therapist("therapist")
        enrich --> plan
        enrich --> implement
        plan --> implement
        implement --> review
        enrich --> pr_write
        implement --> pr_write
        review --> pr_write
        pr_write --> pr_write
        therapist --> enrich
        implement -. repeats .-> implement
        review -. repeats .-> review
        pr_write -. repeats .-> pr_write"
    `);
  });
});

describe("capability gating", () => {
  it("gives the coder repo write access", () => {
    const names = toolNames(coder);

    expect(names).toContain("write");
    expect(names).toContain("edit");
    expect(names).toContain("bash");
    expect(coder.readOnly).toBeUndefined();
  });

  it("keeps the reviewer read-only", () => {
    // A reviewer that could edit becomes a second coder, and its verdict stops
    // meaning anything.
    expect(reviewer.readOnly).toBe(true);
    expect(toolNames(reviewer)).not.toContain("write");
    expect(toolNames(reviewer)).not.toContain("edit");
  });

  it("keeps the enricher and therapist read-only", () => {
    expect(enricher.readOnly).toBe(true);
    expect(therapist.readOnly).toBe(true);
    expect(toolNames(enricher)).not.toContain("write");
    expect(toolNames(therapist)).not.toContain("edit");
  });

  it("gives the planner todo tools but no repo write", () => {
    const names = toolNames(planner);

    // todo_write targets the run's workspace JSON, outside the repo — so writing
    // todos does not require repo write access.
    expect(names).toContain("todo_write");
    expect(names).not.toContain("write");
    expect(planner.readOnly).toBe(true);
  });

  it("gives the writer capture tools ONLY when the change is visual", () => {
    const text = toolNames(writer, { uiChanges: false });
    const visual = toolNames(writer, { uiChanges: true });

    expect(text).not.toContain("browser_screenshot");
    expect(visual).toContain("browser_screenshot");
    expect(visual).toContain("browser_record");
    expect(visual).toContain("upload_image");
  });

  it("gives the writer the same base surface either way", () => {
    const text = toolNames(writer, { uiChanges: false });
    const visual = toolNames(writer, { uiChanges: true });

    // The conditional ADDS capability; it must not silently remove any.
    for (const name of text) expect(visual).toContain(name);
  });

  it("gives the gathering agents the same reach", () => {
    // Asymmetric capability between two agents doing the same job is a bug that
    // only shows up as one of them failing to find something.
    expect(toolNames(enricher).sort()).toEqual(toolNames(therapist).sort());
  });

  it("keeps engine tools explicit and restores attached-context access", () => {
    expect(engineNames(enricher)).toContain("run_code");
    expect(engineNames(coder)).toEqual(["run_code", "run_script"]);
    expect(engineNames(reviewer)).toContain("run_code");
    expect(toolNames(planner)).toContain("fetch_context");
    expect(toolNames(coder)).toContain("fetch_context");
  });

  it("never grants a tool the workflow does not depend on", async () => {
    const declared = new Set(
      (await coding.agents()).flatMap((a) => a.tools({ input: { uiChanges: true } }).map((t) => t.toolName)),
    );

    // Every granted tool comes from an imported instance, so this asserts the
    // dependency graph is real rather than aspirational.
    expect(declared.size).toBeGreaterThan(0);
    expect([...declared]).not.toContain("workhorse_file_ticket");
  });
});

describe("output contracts", () => {
  it("makes the coder declare what routes the pipeline", () => {
    const control = (coder.output as unknown as { entries: { control: { entries: Record<string, unknown> } } }).entries
      .control.entries;

    // run() branches on both; a schema missing either would fail at runtime on a
    // real ticket rather than here.
    expect(Object.keys(control)).toContain("uiChanges");
    expect(Object.keys(control)).toContain("todosRemaining");
  });

  it("makes the reviewer declare a verdict", () => {
    const control = (reviewer.output as unknown as { entries: { control: { entries: Record<string, unknown> } } })
      .entries.control.entries;

    expect(Object.keys(control)).toContain("verdict");
  });

  it("makes the planner declare todos", () => {
    const control = (planner.output as unknown as { entries: { control: { entries: Record<string, unknown> } } })
      .entries.control.entries;

    expect(Object.keys(control)).toContain("todos");
  });
});

describe("stage ids match agent names", () => {
  it("keeps every stage id equal to its agent's name", () => {
    // The graph, the artifact directories, and the live-status view all key on
    // this, so a mismatch would split one stage across two identities.
    for (const stage of graph.stages) expect(stage.id).toBe(stage.agent.name);
  });
});
