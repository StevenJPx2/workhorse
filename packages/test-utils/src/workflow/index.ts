// @workhorse/test-utils/workflow — harnesses for workflow definitions.
//
// A workflow's risk is ROUTING: did the control flow visit the right stages in
// the right order, loop the right number of times, and propagate failures.
// The harness scripts each stage's verdict and records the call sequence, so
// that is assertable with no sandbox, no model, and no harness process.
//
//   const h = workflowHarness({ plan: { todos: [{ id: "t1" }] }, review: { verdict: "pass" } });
//   await coding.run(h.ctx);
//   expect(h.sequence()).toEqual(["enrich", "plan", "implement", "review", "pr-write"]);

export { failingStageHarness, workflowHarness } from "./context";
export type {
  HarnessStageInvocation,
  HarnessStageResult,
  HarnessWorkflowContext,
  StageCall,
  StageScript,
  WorkflowHarness,
  WorkflowHarnessOptions,
} from "./context";
