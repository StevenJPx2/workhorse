// @workhorse/workflow — hard-coded, eval-tested workflow definitions + the
// stage-assembly helpers the worker's WorkflowContext uses. No interpreter,
// no spec registry: a workflow is a TypeScript WorkflowDef, run in-process by
// the worker spine.

export type { Driver, ExecResult } from "./driver";
export { assemblePrompt, stageDir, stageSession, upstreamDigest } from "./compile";
export { validateAgainstSchema } from "./validate";
export {
  StageFailure,
  ThrottledPark,
  stageDigest,
  type StageResult,
  type StageInvocation,
  type WorkflowContext,
  type WorkflowResult,
  type WorkflowDef,
} from "./context";
export { workflowDef, workflowDefs, coding, codingRaw, screenshotPr } from "./workflows/index";
export type {
  FailureKind,
  JsonSchema,
  StageSpec,
  ToolRef,
  WorkflowDefaults,
  WorkflowInput,
  WorkflowSpec,
} from "./types";
