// Routing tests for the flue-first WorkflowDefs — the risky new part
// (routing as control flow) validated with a MOCK context, no harness.
//
// The mock's stage() returns canned control per stage id, records the call
// sequence, and lets a test script per-stage behavior (failing reviews,
// multi-todo loops, uiChanges routing, the revision therapist path).

import { describe, expect, it } from "vitest";
import { failingStageHarness, workflowHarness } from "@workhorse/test-utils/workflow";
import { coding, codingRaw, codingNocode, screenshotPr, workflowDef } from "../src/workflows/index";
import { StageFailure, type WorkflowContext } from "../src/context";

/** The harness ctx is structurally a WorkflowContext — narrow it for run(). */
const asCtx = (h: { ctx: unknown }) => h.ctx as WorkflowContext;

// One pending todo, review passes, no UI change → the simplest full pass.
const oneTodoClean = {
  plan: { todos: [{ id: "t1", title: "do t1" }] },
  implement: { todoId: "t1", uiChanges: false, todosRemaining: 0 },
  review: { verdict: "pass" },
};

describe("coding workflow routing", () => {
  it("runs enrich→plan→implement→review→pr-write for one clean todo", async () => {
    const h = workflowHarness(oneTodoClean);
    const result = await coding.run(asCtx(h));
    expect(result.outcome).toBe("pr");
    expect(h.sequence()).toEqual(["enrich", "plan", "implement", "review", "pr-write"]);
  });

  it("routes to pr-write-visual when the coder declares uiChanges", async () => {
    const h = workflowHarness({
      plan: { todos: [{ id: "t1", title: "ui" }] },
      implement: { uiChanges: true, todosRemaining: 0 },
      review: { verdict: "pass" },
    });
    await coding.run(asCtx(h));
    expect(h.sequence()).toContain("pr-write-visual");
    expect(h.sequence()).not.toContain("pr-write");
  });

  it("loops implement↺review on a failing verdict, then proceeds", async () => {
    const h = workflowHarness((id, calls) => {
      if (id === "plan") return { todos: [{ id: "t1", title: "x" }] };
      if (id === "implement") return { uiChanges: false, todosRemaining: 0 };
      // fail the first review, pass the second
      if (id === "review") return { verdict: calls.filter((c) => c.id === "review").length === 1 ? "fail" : "pass" };
      return {};
    });
    await coding.run(asCtx(h));
    expect(h.visits("implement")).toBe(2);
    expect(h.visits("review")).toBe(2);
    expect(h.routed("review", "implement")).toBe(true);
  });

  it("bounds the review loop even if review keeps failing", async () => {
    const h = workflowHarness({
      plan: { todos: [{ id: "t1", title: "x" }] },
      implement: { uiChanges: false, todosRemaining: 0 },
      review: { verdict: "fail" },
    });
    const result = await coding.run(asCtx(h));
    expect(result.outcome).toBe("pr"); // still delivers, does not spin
    // initial + 2 bounded loop-backs = 3 implements / 3 reviews within the todo
    expect(h.visits("review")).toBe(3);
    expect(h.visits("implement")).toBe(3);
  });

  it("loops per todo until the coder reports none remaining", async () => {
    const h = workflowHarness((id, calls) => {
      if (id === "plan") return { todos: [{ id: "t1", title: "a" }, { id: "t2", title: "b" }] };
      // first implement reports one todo left, second reports none
      if (id === "implement") {
        return { uiChanges: false, todosRemaining: calls.filter((c) => c.id === "implement").length === 1 ? 1 : 0 };
      }
      if (id === "review") return { verdict: "pass" };
      return {};
    });
    await coding.run(asCtx(h));
    // two full todo cycles
    expect(h.visits("implement")).toBe(2);
    expect(h.visits("review")).toBe(2);
    expect(h.visits("pr-write")).toBe(2);
  });

  it("revision run routes through the therapist before re-enriching", async () => {
    const h = workflowHarness(oneTodoClean, { runId: "def-x-rev1" });
    await coding.run(asCtx(h));
    expect(h.sequence().slice(0, 2)).toEqual(["therapist", "enrich"]);
  });

  it("propagates a hard StageFailure (does not swallow)", async () => {
    const h = failingStageHarness("implement", new StageFailure("implement", "session", "container died"), {
      plan: { todos: [{ id: "t1", title: "x" }] },
    });
    await expect(coding.run(asCtx(h))).rejects.toThrow(/container died/);
  });
});

describe("coding-raw workflow routing", () => {
  it("runs exactly one stage and delivers a PR", async () => {
    const h = workflowHarness({ do: { status: "done" } });
    const result = await codingRaw.run(asCtx(h));
    expect(result.outcome).toBe("pr");
    expect(h.sequence()).toEqual(["do"]);
  });
});

describe("manifests", () => {
  it("coding manifest carries the full agent pipeline with pr-write terminals", () => {
    expect(coding.stages.map((s) => s.id)).toEqual([
      "enrich",
      "plan",
      "implement",
      "review",
      "pr-write",
      "pr-write-visual",
      "therapist",
    ]);
    // both PR-body writers are terminal (outcome pr)
    expect(coding.stages.find((s) => s.id === "pr-write")?.outcome).toBe("pr");
    expect(coding.stages.find((s) => s.id === "pr-write-visual")?.outcome).toBe("pr");
  });

  it("read-only stages declare no write/edit tools", () => {
    for (const id of ["enrich", "plan", "review", "pr-write", "therapist"]) {
      const s = coding.stages.find((x) => x.id === id)!;
      const names = (s.tools ?? []).map((t) => (typeof t === "string" ? t : t.name));
      expect(names, id).not.toContain("write");
      expect(names, id).not.toContain("edit");
      expect(s.readOnly, id).toBe(true);
    }
  });

  it("only the visual PR writer carries browser/screenshot tools", () => {
    const names = (id: string) =>
      (coding.stages.find((s) => s.id === id)!.tools ?? []).map((t) => (typeof t === "string" ? t : t.name));
    expect(names("pr-write-visual")).toContain("browser_screenshot");
    expect(names("pr-write")).not.toContain("browser_screenshot");
  });

  it("each stage names its agent block; pr-coder is the default", () => {
    expect(coding.defaults?.agent).toBe("pr-coder");
    expect(coding.stages.find((s) => s.id === "enrich")?.agent).toBe("enricher");
    expect(coding.stages.find((s) => s.id === "plan")?.agent).toBe("planner");
    expect(coding.stages.find((s) => s.id === "review")?.agent).toBe("pr-reviewer");
    expect(coding.stages.find((s) => s.id === "pr-write")?.agent).toBe("pr-writer");
    expect(coding.stages.find((s) => s.id === "therapist")?.agent).toBe("therapist");
  });

  it("coding-nocode derives from coding with run_code stripped", () => {
    const names = (def: typeof coding, id: string) =>
      (def.stages.find((s) => s.id === id)?.tools ?? []).map((t) => (typeof t === "string" ? t : t.name));
    // same stage set
    expect(codingNocode.stages.map((s) => s.id)).toEqual(coding.stages.map((s) => s.id));
    // run_code present in coding.implement, absent in coding-nocode
    expect(names(coding, "implement")).toContain("run_code");
    expect(names(codingNocode, "implement")).not.toContain("run_code");
  });

  it("registry resolves all workflows by name; unknown → undefined", () => {
    expect(workflowDef("coding")).toBe(coding);
    expect(workflowDef("coding-nocode")).toBe(codingNocode);
    expect(workflowDef("coding-raw")).toBe(codingRaw);
    expect(workflowDef("screenshot-pr")).toBe(screenshotPr);
    expect(workflowDef("nope")).toBeUndefined();
    expect(workflowDef(undefined)).toBeUndefined();
  });

  it("screenshot-pr is single-stage with a pr outcome", () => {
    expect(screenshotPr.stages.map((s) => s.id)).toEqual(["shoot"]);
    expect(screenshotPr.stages[0].outcome).toBe("pr");
  });
});
