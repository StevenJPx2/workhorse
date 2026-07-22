import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "../src/engine";
import { stageDir } from "../src/compile";
import { validateWorkflowSpec } from "../src/validate";
import type { WorkflowSpec } from "../src/types";
import { MockDriver } from "./mock-driver";

const spec = (over: Partial<WorkflowSpec> = {}): WorkflowSpec => ({
  schemaVersion: 1,
  name: "coding",
  defaults: { agent: "coder", thinking: "low" },
  artifactGraph: {
    stages: [
      { id: "plan", type: "single", readOnly: true, prompt: "Plan it.", output: { analysis: { required: true } } },
      { id: "implement", from: "plan", prompt: "Build it.", tools: ["read", "write", { name: "run_script", classification: "write-capable" }] },
      {
        id: "verify",
        from: "implement",
        agent: "verifier",
        prompt: "Verify it.",
        output: { controlSchema: { type: "object", properties: { verdict: { enum: ["pass", "fail"] } }, required: ["verdict"] } },
      },
    ],
  },
  ...over,
});

async function dispatchAndRun(engine: WorkflowEngine, driver: MockDriver) {
  const state = await engine.dispatch("Fix the bug", { runId: "wfrun_test" });
  return state;
}

describe("validateWorkflowSpec", () => {
  it("accepts the coding-shaped spec", () => {
    expect(validateWorkflowSpec(spec())).toEqual([]);
  });
  it("collects multiple errors with paths", () => {
    const errs = validateWorkflowSpec({
      schemaVersion: 2,
      name: "Bad Name",
      artifactGraph: { stages: [{ id: "a", prompt: "", from: "ghost" }] },
    });
    expect(errs.join("\n")).toContain("$.schemaVersion");
    expect(errs.join("\n")).toContain("$.name");
    expect(errs.join("\n")).toContain('unknown stage "ghost"');
    expect(errs.join("\n")).toContain("prompt: required");
  });
  it("rejects cycles and non-terminal outcomes", () => {
    const errs = validateWorkflowSpec({
      schemaVersion: 1,
      name: "cyclic",
      artifactGraph: {
        stages: [
          { id: "a", from: "b", prompt: "x", outcome: "report" },
          { id: "b", from: "a", prompt: "y" },
        ],
      },
    });
    expect(errs.join("\n")).toContain("cycle detected");
  });
});

describe("run lifecycle", () => {
  it("runs stages in order, feeding digests downstream", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);

    // Burst 1: plan launches.
    let r = await engine.advance("wfrun_test", 0);
    expect(r.tasks).toEqual([
      { id: "plan", status: "running" },
      { id: "implement", status: "pending" },
      { id: "verify", status: "pending" },
    ]);
    // Plan declares no tools → launch runs without a --tools allowlist.
    expect(driver.launches.at(-1)!.command).not.toContain("--tools");
    expect(driver.launches.at(-1)!.command).toContain("--append-system-prompt");

    // plan finishes.
    driver.finishSession(stageDir("wfrun_test", "plan", 1), { status: "done" }, "PLAN ANALYSIS");
    r = await engine.advance("wfrun_test", 0);
    expect(r.tasks[0].status).toBe("completed");
    expect(r.tasks[1].status).toBe("running");

    // implement's prompt embeds plan's digest; its agent file has the ceiling.
    const implPrompt = driver.files.get(`${stageDir("wfrun_test", "implement", 1)}/prompt.md`)!;
    expect(implPrompt).toContain("PLAN ANALYSIS");
    expect(implPrompt).toContain("Upstream stage `plan`");
    // implement's tool ceiling rides the CLI allowlist; submit_work (the
    // dedicated completion tool) is appended to every ceilinged stage.
    expect(driver.launches.at(-1)!.command).toContain('--tools "read,write,run_script,submit_work"');
    // Stage dir exported for submit_work.
    expect(driver.launches.at(-1)!.command).toContain("WORKHORSE_STAGE_DIR=");

    driver.finishSession(stageDir("wfrun_test", "implement", 1), { status: "done" });
    r = await engine.advance("wfrun_test", 0);
    expect(r.tasks[2].status).toBe("running");

    driver.finishSession(stageDir("wfrun_test", "verify", 1), { verdict: "pass" });
    r = await engine.advance("wfrun_test", 0);
    expect(r.status).toBe("completed");
  });

  it("schema-validates control and classifies contract failures", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "plan", 1), { status: "done" });
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "implement", 1), { status: "done" });
    await engine.advance("wfrun_test", 0);
    // verify emits control violating the schema.
    driver.finishSession(stageDir("wfrun_test", "verify", 1), { verdict: "maybe" });
    const r = await engine.advance("wfrun_test", 0);
    expect(r.status).toBe("failed");
    const state = await engine.load("wfrun_test");
    expect(state.stages[2].failureKind).toBe("control");
    expect(state.stages[2].detail).toContain("verdict");
  });

  it("classifies model-plane failures from the session log", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    driver.crashSession(stageDir("wfrun_test", "plan", 1), "Error: 429 rate limit exceeded from upstream");
    const r = await engine.advance("wfrun_test", 0);
    expect(r.status).toBe("failed");
    expect(r.modelFailure).toBe(true);
  });

  it("steers a LIVE stage in-session (RPC verb, context intact)", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);

    const dir = stageDir("wfrun_test", "plan", 1);
    const steered = await engine.steer("wfrun_test", "Focus only on the parser.");
    expect(steered).toBe("plan");
    // No relaunch — the steer verb went into the live session's fifo.
    expect(driver.launches.length).toBe(1);
    const sent = driver.rpcSent.get(dir)!;
    const steerCmd = sent.find((c) => c.type === "steer");
    expect(steerCmd?.message).toContain("Focus only on the parser.");
    const state = await engine.load("wfrun_test");
    expect(state.stages[0].status).toBe("running");
  });

  it("steers a DEAD stage by reset + relaunch with the message folded in", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    // Session dies without artifacts → steer falls back to restart.
    driver.crashSession(stageDir("wfrun_test", "plan", 1), "boom");
    await engine.advance("wfrun_test", 0);
    const steered = await engine.steer("wfrun_test", "Focus only on the parser.");
    expect(steered).toBe("plan");
    const r = await engine.advance("wfrun_test", 0);
    expect(r.tasks[0].status).toBe("running");
    expect(driver.launches.length).toBe(2);
    const prompt = driver.files.get(`${stageDir("wfrun_test", "plan", 1)}/prompt.md`)!;
    expect(prompt).toContain("Operator steering");
    expect(prompt).toContain("Focus only on the parser.");
  });

  it("classifies model failures from RPC retry events; promote re-runs on a new model", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);

    const dir = stageDir("wfrun_test", "plan", 1);
    // The session's own retry loop gives up — typed signal, no log regex.
    driver.emit(dir, {
      type: "auto_retry_end",
      success: false,
      attempt: 3,
      finalError: "529 overloaded_error: Overloaded",
    });
    let r = await engine.advance("wfrun_test", 0);
    expect(r.modelFailure).toBe(true);
    const state = await engine.load("wfrun_test");
    expect(state.stages[0].failureKind).toBe("model");
    expect(state.stages[0].detail).toContain("529");

    await engine.promote("wfrun_test", "claude-haiku-4-5");
    r = await engine.advance("wfrun_test", 0);
    expect(r.tasks[0].status).toBe("running");
    expect(driver.launches.at(-1)!.command).toContain('--model "claude-haiku-4-5"');
  });

  it("promotes a LIVE healthy stage in-session via set_model", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    const dir = stageDir("wfrun_test", "plan", 1);
    await engine.promote("wfrun_test", "claude-opus-4-6", "plan");
    // No relaunch — model switched inside the live session.
    expect(driver.launches.length).toBe(1);
    const setModel = driver.rpcSent.get(dir)!.find((c) => c.type === "set_model");
    expect(setModel?.modelId).toBe("claude-opus-4-6");
    const state = await engine.load("wfrun_test");
    expect(state.stages[0].model).toBe("claude-opus-4-6");
  });

  it("routes verify fail → back to implement with the verdict embedded; pass → $end", async () => {
    const branching: WorkflowSpec = {
      schemaVersion: 1,
      name: "branchy",
      artifactGraph: {
        stages: [
          { id: "implement", prompt: "Do the work.", tools: ["read", "write"] },
          {
            id: "verify",
            from: "implement",
            prompt: "Check the work.",
            output: { controlSchema: { type: "object", required: ["verdict"], properties: { verdict: { enum: ["pass", "fail"] } } } },
            next: [
              { when: { verdict: "fail" }, to: "implement" },
              { when: { verdict: "pass" }, to: "$end" },
            ],
            maxLoopbacks: 1,
          },
          { id: "polish", from: "verify", prompt: "Only runs when no rule matched.", outcome: "pr" },
        ],
      },
    };
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, branching);
    await engine.dispatch("Fix the bug", { runId: "wfrun_test" });
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "implement", 1), { status: "done" }, "did the work");
    await engine.advance("wfrun_test", 0); // collect implement, launch verify
    await engine.advance("wfrun_test", 0);

    // Round 1: verify FAILS → loop back to implement with the verdict.
    driver.finishSession(
      stageDir("wfrun_test", "verify", 1),
      { verdict: "fail", blocking: [{ file: "a.ts", problem: "off-by-one" }] },
      "found an off-by-one",
    );
    let r = await engine.advance("wfrun_test", 0);
    let state = await engine.load("wfrun_test");
    // Routing reset implement and the same burst relaunched it (round 2).
    expect(state.stages[0].status).toBe("running");
    expect(state.stages[1].loopbacks).toBe(1);
    expect(r.status).toBe("running");

    // The re-run prompt carries the verify verdict.
    const rerunPrompt = driver.files.get(`${stageDir("wfrun_test", "implement", 2)}/prompt.md`)!;
    expect(rerunPrompt).toContain("Routed back from `verify`");
    expect(rerunPrompt).toContain("off-by-one");
    driver.finishSession(stageDir("wfrun_test", "implement", 2), { status: "done" }, "fixed");
    await engine.advance("wfrun_test", 0); // collect implement, launch verify round 2
    await engine.advance("wfrun_test", 0);

    // Round 2: verify PASSES → $end; polish is SKIPPED, run completes.
    driver.finishSession(stageDir("wfrun_test", "verify", 2), { verdict: "pass", blocking: [] }, "clean");
    r = await engine.advance("wfrun_test", 0);
    state = await engine.load("wfrun_test");
    expect(state.stages[1].status).toBe("completed");
    expect(state.stages[2].status).toBe("skipped");
    expect(state.status).toBe("completed");
  });

  it("suppresses the loop-back at the cap and proceeds", async () => {
    const branching: WorkflowSpec = {
      schemaVersion: 1,
      name: "capped",
      artifactGraph: {
        stages: [
          { id: "implement", prompt: "Work.", tools: ["read"] },
          {
            id: "verify",
            from: "implement",
            prompt: "Check.",
            next: [{ when: { verdict: "fail" }, to: "implement" }],
            maxLoopbacks: 0, // no loop-backs allowed
            outcome: "pr",
          },
        ],
      },
    };
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, branching);
    await engine.dispatch("task", { runId: "wfrun_test" });
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "implement", 1), { status: "done" });
    await engine.advance("wfrun_test", 0);
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "verify", 1), { verdict: "fail" });
    await engine.advance("wfrun_test", 0);
    const state = await engine.load("wfrun_test");
    // Cap 0: route suppressed, verify stays completed, run finishes.
    expect(state.stages[1].status).toBe("completed");
    expect(state.stages[1].detail).toContain("loop-back cap");
    expect(state.status).toBe("completed");
  });

  it("captures session stats at collect (get_session_stats round-trip)", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    const dir = stageDir("wfrun_test", "plan", 1);
    // Settled but still alive: engine asks for stats before killing.
    driver.files.set(`${dir}/control.json`, JSON.stringify({ status: "done" }));
    driver.files.set(`${dir}/analysis.md`, "done");
    driver.emit(dir, { type: "agent_settled" });
    await engine.advance("wfrun_test", 0);
    const state = await engine.load("wfrun_test");
    expect(state.stages[0].status).toBe("completed");
    expect(state.stages[0].stats?.tokens?.total).toBe(1200);
    expect(state.stages[0].stats?.cost).toBe(0.05);
  });

  it("delegation surfaces from completed control; promotion re-runs the stage", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "plan", 1), {
      status: "done",
      delegate: true,
      delegateReason: "needs deep architecture reasoning",
    });
    const r = await engine.advance("wfrun_test", 0);
    expect(r.delegating).toMatchObject({ taskId: "plan", reason: "needs deep architecture reasoning" });
    await engine.promote("wfrun_test", "claude-opus-4-6", "plan");
    const r2 = await engine.advance("wfrun_test", 0);
    expect(r2.tasks[0].status).toBe("running");
    expect(driver.launches.at(-1)!.command).toContain("claude-opus-4-6");
  });

  it("parks on inputRequest and resumes with injected answers", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "plan", 1), {
      inputRequest: {
        title: "Which approach?",
        schema: { type: "object", properties: { approach: { enum: ["rewrite", "patch"] } }, required: ["approach"] },
      },
    });
    let r = await engine.advance("wfrun_test", 0);
    expect(r.status).toBe("awaiting-input");
    expect(r.awaitingInput?.stageId).toBe("plan");

    // Bad answers rejected against the requested schema.
    await expect(engine.injectInput("wfrun_test", {})).rejects.toThrow(/required/);

    await engine.injectInput("wfrun_test", { approach: "patch" });
    r = await engine.advance("wfrun_test", 0);
    expect(r.status).toBe("running");
    const prompt = driver.files.get(`${stageDir("wfrun_test", "plan", 1)}/prompt.md`)!;
    expect(prompt).toContain('"approach": "patch"');
  });

  it("loop stages repeat until the until-condition, capped by maxRounds", async () => {
    const driver = new MockDriver();
    const loopSpec = spec({
      artifactGraph: {
        stages: [
          {
            id: "refine",
            type: "loop",
            prompt: "Refine.",
            until: "$.reviewStatus == 'complete'",
            maxRounds: 3,
            outcome: "report",
          },
        ],
      },
    });
    const engine = new WorkflowEngine(driver, loopSpec);
    await engine.dispatch("Write the report", { runId: "wfrun_test" });

    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "refine", 1), { reviewStatus: "incomplete" });
    let r = await engine.advance("wfrun_test", 0);
    // Round 1 done, not until — relaunched as round 2.
    expect(r.tasks[0].status).toBe("running");
    const p2 = driver.files.get(`${stageDir("wfrun_test", "refine", 2)}/prompt.md`)!;
    expect(p2).toContain("Loop round 2");
    expect(p2).toContain("incomplete");

    driver.finishSession(stageDir("wfrun_test", "refine", 2), { reviewStatus: "complete" });
    r = await engine.advance("wfrun_test", 0);
    expect(r.status).toBe("completed");
    expect(engine.outcome()).toBe("report");
  });

  it("collect() and activity() read the terminal artifacts", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "plan", 1), { status: "done" }, "P");
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "implement", 1), { status: "done" }, "I");
    await engine.advance("wfrun_test", 0);
    driver.finishSession(stageDir("wfrun_test", "verify", 1), { verdict: "pass" }, "VERIFY SAYS PASS");
    await engine.advance("wfrun_test", 0);

    const { analysis, stages } = await engine.collect("wfrun_test");
    expect(analysis).toBe("VERIFY SAYS PASS");
    expect(stages.map((s) => s.id)).toEqual(["plan", "implement", "verify"]);

    const activity = await engine.activity("wfrun_test");
    expect(activity.status).toBe("completed");
    expect((activity.tasks as Array<{ id: string }>).length).toBe(3);
  });

  it("cancel kills the session and finalizes the run", async () => {
    const driver = new MockDriver();
    const engine = new WorkflowEngine(driver, spec());
    await dispatchAndRun(engine, driver);
    await engine.advance("wfrun_test", 0);
    await engine.cancel("wfrun_test");
    const state = await engine.load("wfrun_test");
    expect(state.status).toBe("cancelled");
    expect(driver.alive.size).toBe(0);
  });
});
