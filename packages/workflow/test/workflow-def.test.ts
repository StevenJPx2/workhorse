// Routing tests for the flue-first WorkflowDefs — the risky new part
// (routing as control flow) validated with a MOCK context, no harness.
//
// The mock's stage() returns canned verdicts per stage id, records the call
// sequence, and lets a test script a failing verify to exercise the loop-back.

import { describe, expect, it } from "vitest";
import { coding, codingRaw } from "../src/workflows/index";
import { StageFailure, type StageInvocation, type StageResult, type WorkflowContext } from "../src/context";

interface Call {
  id: string;
  routedFrom?: string;
}

/** Build a mock ctx whose stage() returns scripted control per call. */
function mockCtx(
  script: (id: string, callIndex: number, calls: Call[]) => Record<string, unknown>,
): { ctx: WorkflowContext; calls: Call[] } {
  const calls: Call[] = [];
  const ctx: WorkflowContext = {
    runId: "r1",
    task: "do the thing",
    inputs: {},
    async stage(id: string, inv?: StageInvocation): Promise<StageResult> {
      const call: Call = { id, routedFrom: inv?.routedFrom?.stage };
      calls.push(call);
      const control = script(id, calls.length - 1, calls);
      return { stageId: id, control, analysis: `analysis for ${id} #${calls.length}` };
    },
  };
  return { ctx, calls };
}

describe("coding workflow routing", () => {
  it("passes straight through when verify passes first time", async () => {
    const { ctx, calls } = mockCtx((id) => (id === "verify" ? { verdict: "pass" } : { status: "done" }));
    const result = await coding.run(ctx);
    expect(result.outcome).toBe("pr");
    expect(calls.map((c) => c.id)).toEqual(["plan", "implement", "verify"]);
  });

  it("loops back to implement on a failing verdict, then passes", async () => {
    // verify fails once (call index 2), passes on the second verify.
    let verifyCount = 0;
    const { ctx, calls } = mockCtx((id) => {
      if (id !== "verify") return { status: "done" };
      verifyCount += 1;
      return verifyCount === 1 ? { verdict: "fail", blocking: [{ file: "a.ts", problem: "bug", why: "x" }] } : { verdict: "pass" };
    });
    const result = await coding.run(ctx);
    expect(result.outcome).toBe("pr");
    // plan, implement, verify(fail), implement(routed), verify(pass)
    expect(calls.map((c) => c.id)).toEqual(["plan", "implement", "verify", "implement", "verify"]);
    // the re-run implement carries loop-back context from verify
    expect(calls[3].routedFrom).toBe("verify");
  });

  it("stops looping at maxLoopbacks even if verify keeps failing", async () => {
    const { ctx, calls } = mockCtx((id) => (id === "verify" ? { verdict: "fail" } : { status: "done" }));
    const result = await coding.run(ctx);
    expect(result.outcome).toBe("pr"); // still delivers (bounded), does not spin
    // attempts 0,1,2 → 3 verifies, 2 loop-back implements (+ initial) = 3 implements
    expect(calls.filter((c) => c.id === "verify").length).toBe(3);
    expect(calls.filter((c) => c.id === "implement").length).toBe(3);
  });

  it("propagates a hard StageFailure (does not swallow)", async () => {
    const ctx: WorkflowContext = {
      runId: "r1",
      task: "t",
      inputs: {},
      async stage(id) {
        if (id === "implement") throw new StageFailure(id, "session", "container died");
        return { stageId: id, control: { status: "done" }, analysis: "a" };
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
  it("coding manifest is plan→implement→verify with verify terminal (outcome pr)", () => {
    expect(coding.stages.map((s) => s.id)).toEqual(["plan", "implement", "verify"]);
    expect(coding.stages.at(-1)?.outcome).toBe("pr");
  });
  it("read-only stages declare no write/bash-mutation tools", () => {
    const plan = coding.stages.find((s) => s.id === "plan")!;
    const names = (plan.tools ?? []).map((t) => (typeof t === "string" ? t : t.name));
    expect(names).not.toContain("write");
    expect(names).not.toContain("edit");
    expect(plan.readOnly).toBe(true);
  });
});
