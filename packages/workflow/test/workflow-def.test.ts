// Routing tests for the flue-first WorkflowDefs — the risky new part
// (routing as control flow) validated with a MOCK context, no harness.
//
// The mock's stage() returns canned control per stage id, records the call
// sequence, and lets a test script per-stage behavior (failing reviews,
// multi-todo loops, uiChanges routing, the revision therapist path).

import { describe, expect, it } from "vitest";
import { coding, codingRaw, codingNocode, screenshotPr, workflowDef } from "../src/workflows/index";
import { StageFailure, type StageInvocation, type StageResult, type WorkflowContext } from "../src/context";

interface Call {
  id: string;
  routedFrom?: string;
}

/** Build a mock ctx whose stage() returns scripted control per call. */
function mockCtx(
  script: (id: string, calls: Call[]) => Record<string, unknown>,
  opts?: { runId?: string },
): { ctx: WorkflowContext; calls: Call[] } {
  const calls: Call[] = [];
  const ctx: WorkflowContext = {
    runId: opts?.runId ?? "r1",
    task: "do the thing",
    inputs: {},
    async stage(id: string, inv?: StageInvocation): Promise<StageResult> {
      const call: Call = { id, routedFrom: inv?.routedFrom?.stage };
      calls.push(call);
      const control = script(id, calls);
      return { stageId: id, control, analysis: `analysis for ${id} #${calls.length}` };
    },
  };
  return { ctx, calls };
}

// One pending todo, review passes, no UI change → the simplest full pass.
const oneTodoClean = (id: string): Record<string, unknown> => {
  if (id === "plan") return { todos: [{ id: "t1", title: "do t1" }] };
  if (id === "implement") return { todoId: "t1", uiChanges: false, todosRemaining: 0 };
  if (id === "review") return { verdict: "pass" };
  return {};
};

describe("coding workflow routing", () => {
  it("runs enrich→plan→implement→review→pr-write for one clean todo", async () => {
    const { ctx, calls } = mockCtx(oneTodoClean);
    const result = await coding.run(ctx);
    expect(result.outcome).toBe("pr");
    expect(calls.map((c) => c.id)).toEqual(["enrich", "plan", "implement", "review", "pr-write"]);
  });

  it("routes to pr-write-visual when the coder declares uiChanges", async () => {
    const { ctx, calls } = mockCtx((id) => {
      if (id === "plan") return { todos: [{ id: "t1", title: "ui" }] };
      if (id === "implement") return { uiChanges: true, todosRemaining: 0 };
      if (id === "review") return { verdict: "pass" };
      return {};
    });
    await coding.run(ctx);
    expect(calls.map((c) => c.id)).toContain("pr-write-visual");
    expect(calls.map((c) => c.id)).not.toContain("pr-write");
  });

  it("loops implement↺review on a failing verdict, then proceeds", async () => {
    let reviews = 0;
    const { ctx, calls } = mockCtx((id) => {
      if (id === "plan") return { todos: [{ id: "t1", title: "x" }] };
      if (id === "implement") return { uiChanges: false, todosRemaining: 0 };
      if (id === "review") return { verdict: ++reviews === 1 ? "fail" : "pass" };
      return {};
    });
    await coding.run(ctx);
    // implement, review(fail), implement(routed), review(pass), pr-write
    const ids = calls.map((c) => c.id);
    expect(ids.filter((i) => i === "implement").length).toBe(2);
    expect(ids.filter((i) => i === "review").length).toBe(2);
    expect(calls.find((c) => c.id === "implement" && c.routedFrom === "review")).toBeTruthy();
  });

  it("bounds the review loop even if review keeps failing", async () => {
    const { ctx, calls } = mockCtx((id) => {
      if (id === "plan") return { todos: [{ id: "t1", title: "x" }] };
      if (id === "implement") return { uiChanges: false, todosRemaining: 0 };
      if (id === "review") return { verdict: "fail" };
      return {};
    });
    const result = await coding.run(ctx);
    expect(result.outcome).toBe("pr"); // still delivers, does not spin
    // initial + 2 bounded loop-backs = 3 implements / 3 reviews within the todo
    expect(calls.filter((c) => c.id === "review").length).toBe(3);
    expect(calls.filter((c) => c.id === "implement").length).toBe(3);
  });

  it("loops per todo until the coder reports none remaining", async () => {
    let impl = 0;
    const { ctx, calls } = mockCtx((id) => {
      if (id === "plan") return { todos: [{ id: "t1", title: "a" }, { id: "t2", title: "b" }] };
      if (id === "implement") return { uiChanges: false, todosRemaining: ++impl === 1 ? 1 : 0 };
      if (id === "review") return { verdict: "pass" };
      return {};
    });
    await coding.run(ctx);
    // two full todo cycles
    expect(calls.filter((c) => c.id === "implement").length).toBe(2);
    expect(calls.filter((c) => c.id === "review").length).toBe(2);
    expect(calls.filter((c) => c.id === "pr-write").length).toBe(2);
  });

  it("revision run routes through the therapist before re-enriching", async () => {
    const { ctx, calls } = mockCtx(oneTodoClean, { runId: "def-x-rev1" });
    await coding.run(ctx);
    expect(calls[0].id).toBe("therapist");
    expect(calls[1].id).toBe("enrich");
  });

  it("propagates a hard StageFailure (does not swallow)", async () => {
    const ctx: WorkflowContext = {
      runId: "r1",
      task: "t",
      inputs: {},
      async stage(id) {
        if (id === "implement") throw new StageFailure(id, "session", "container died");
        if (id === "plan") return { stageId: id, control: { todos: [{ id: "t1", title: "x" }] }, analysis: "a" };
        return { stageId: id, control: {}, analysis: "a" };
      },
    };
    await expect(coding.run(ctx)).rejects.toThrow(/container died/);
  });
});

describe("coding-raw workflow routing", () => {
  it("runs exactly one stage and delivers a PR", async () => {
    const { ctx, calls } = mockCtx(() => ({ status: "done" }));
    const result = await codingRaw.run(ctx);
    expect(result.outcome).toBe("pr");
    expect(calls.map((c) => c.id)).toEqual(["do"]);
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
