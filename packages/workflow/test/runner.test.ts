// Runner-mode (flue path) engine tests: with EngineOptions.runner set, a
// stage runs to completion inside advance() and the engine collects the
// verdict from control.json + analysis.md — no pid, no cross-burst poll.
// A MockRunner stands in for flueStageRunner (writes the two artifacts the
// way submit_work would), so this proves the engine branch + routing/loop
// without any network.

import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "../src/engine";
import { stageDir } from "../src/compile";
import type { StageRunInput, StageRunResult, StageRunner } from "../src/runner";
import type { WorkflowSpec } from "../src/types";
import { MockDriver } from "./mock-driver";

const spec = (over: Partial<WorkflowSpec> = {}): WorkflowSpec => ({
  schemaVersion: 1,
  name: "coding",
  defaults: { agent: "coder", thinking: "low" },
  artifactGraph: {
    stages: [
      { id: "plan", type: "single", readOnly: true, prompt: "Plan it.", output: { analysis: { required: true } } },
      { id: "implement", from: "plan", prompt: "Build it.", tools: ["read", "write"] },
      {
        id: "verify",
        from: "implement",
        agent: "verifier",
        prompt: "Verify it.",
        output: { controlSchema: { type: "object", properties: { verdict: { enum: ["pass", "fail"] } }, required: ["verdict"] } },
        next: [
          { when: { verdict: "fail" }, to: "implement" },
          { when: { verdict: "pass" }, to: "$end" },
        ],
        maxLoopbacks: 2,
      },
    ],
  },
  ...over,
});

/** Records every stage it runs; writes artifacts per a scripted control map. */
class MockRunner implements StageRunner {
  ran: Array<{ stageId: string; round: number; tools: string[]; writeAllow: string[]; model?: string }> = [];

  constructor(
    private readonly driver: MockDriver,
    /** control per stage; a function lets verify flip fail→pass across rounds. */
    private readonly controlFor: (stageId: string, round: number) => Record<string, unknown>,
  ) {}

  async runStage(input: StageRunInput): Promise<StageRunResult> {
    this.ran.push({
      stageId: input.stageId,
      round: input.round,
      tools: input.tools,
      writeAllow: input.writeAllow,
      model: input.model,
    });
    const control = this.controlFor(input.stageId, input.round);
    await this.driver.writeFile(`${input.dir}/analysis.md`, `${input.stageId} analysis`);
    await this.driver.writeFile(`${input.dir}/control.json`, JSON.stringify(control));
    return { stats: { tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, total: 120 }, cost: 0.01 } };
  }
}

describe("runner mode (flue path)", () => {
  it("drives the full graph in one advance sweep, no pid, verdict pass", async () => {
    const driver = new MockDriver();
    const runner = new MockRunner(driver, (id) => (id === "verify" ? { verdict: "pass" } : { status: "done" }));
    const engine = new WorkflowEngine(driver, spec(), { runner });
    await engine.dispatch("Fix the bug", { runId: "wfrun_r1" });

    // Each advance runs exactly one stage to completion (no poll).
    let r = await engine.advance("wfrun_r1", 0);
    while (r.status === "running") r = await engine.advance("wfrun_r1", 0);

    expect(r.status).toBe("completed");
    expect(runner.ran.map((x) => x.stageId)).toEqual(["plan", "implement", "verify"]);
    // No pid ever set on a runner-mode stage.
    const state = await engine.load("wfrun_r1");
    expect(state.stages.every((s) => s.pid === undefined)).toBe(true);
    // Stats captured from the runner.
    expect(state.stages.find((s) => s.id === "plan")?.stats?.tokens?.total).toBe(120);
    // Artifacts landed where the engine expects them.
    expect(driver.files.get(`${stageDir("wfrun_r1", "plan", 1)}/control.json`)).toContain("done");
  });

  it("routes verify fail → implement (loop-back), then pass → done", async () => {
    const driver = new MockDriver();
    // verify fails on round 1, passes on round 2.
    const runner = new MockRunner(driver, (id, round) =>
      id === "verify" ? { verdict: round >= 2 ? "pass" : "fail" } : { status: "done" },
    );
    const engine = new WorkflowEngine(driver, spec(), { runner });
    await engine.dispatch("Fix the bug", { runId: "wfrun_r2" });

    let r = await engine.advance("wfrun_r2", 0);
    let guard = 0;
    while (r.status === "running" && guard++ < 20) r = await engine.advance("wfrun_r2", 0);

    expect(r.status).toBe("completed");
    // implement ran twice (initial + loop-back), verify ran twice.
    const ids = runner.ran.map((x) => x.stageId);
    expect(ids.filter((x) => x === "implement").length).toBe(2);
    expect(ids.filter((x) => x === "verify").length).toBe(2);
    // The routed-from digest reached implement's re-run prompt.
    const implRound2 = runner.ran.filter((x) => x.stageId === "implement")[1];
    expect(implRound2).toBeTruthy();
  });

  it("classifies a runner failure without a pid", async () => {
    const driver = new MockDriver();
    const runner: StageRunner = {
      async runStage() {
        return { failure: { kind: "model", detail: "429 overloaded" } };
      },
    };
    const engine = new WorkflowEngine(driver, spec(), { runner });
    await engine.dispatch("x", { runId: "wfrun_r3" });
    const r = await engine.advance("wfrun_r3", 0);
    expect(r.status).toBe("failed");
    expect(r.modelFailure).toBe(true);
  });

  it("passes the stage tool allowlist + writeAllow to the runner", async () => {
    const driver = new MockDriver();
    const runner = new MockRunner(driver, () => ({ status: "done" }));
    const s = spec();
    s.artifactGraph.stages[1].writeAllow = ["src/**"];
    const engine = new WorkflowEngine(driver, s, { runner });
    await engine.dispatch("x", { runId: "wfrun_r4" });
    let r = await engine.advance("wfrun_r4", 0);
    while (r.status === "running") r = await engine.advance("wfrun_r4", 0);
    const impl = runner.ran.find((x) => x.stageId === "implement");
    expect(impl?.tools).toContain("write");
    // submit_work is appended by stageSession (completion is its job).
    expect(impl?.tools).toContain("submit_work");
    expect(impl?.writeAllow).toEqual(["src/**"]);
  });
});
