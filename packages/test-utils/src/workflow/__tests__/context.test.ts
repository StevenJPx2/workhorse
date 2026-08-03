import { describe, expect, it } from "vitest";
import { failingStageHarness, workflowHarness } from "../context";

const agent = (name: string) => ({ name });

describe("workflow harness", () => {
  it("scripts agent outputs and records upstream routing", async () => {
    const harness = workflowHarness({ plan: { todos: [{ id: "t1" }] } });
    const plan = await harness.ctx.run(agent("plan"));
    await harness.ctx.run(agent("implement"), { upstream: [plan], routedFrom: { stage: "review", digest: "fix it" } });

    expect(plan.output.control).toEqual({ todos: [{ id: "t1" }] });
    expect(harness.sequence()).toEqual(["plan", "implement"]);
    expect(harness.callsTo("implement")[0]?.upstream).toEqual(["plan"]);
    expect(harness.routed("review", "implement")).toBe(true);
  });

  it("supports visit-aware scripts", async () => {
    const harness = workflowHarness((id, calls) => ({ visit: calls.filter((call) => call.id === id).length }));

    await harness.ctx.run(agent("review"));
    const second = await harness.ctx.run(agent("review"));

    expect(second.control).toEqual({ visit: 2 });
    expect(harness.visits("review")).toBe(2);
  });

  it("propagates a scripted agent failure", async () => {
    const harness = failingStageHarness("review", new Error("review failed"));

    await expect(harness.ctx.run(agent("review"))).rejects.toThrow("review failed");
  });
});
