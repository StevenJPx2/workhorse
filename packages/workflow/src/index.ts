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
export type { FailureKind, JsonSchema, StageSpec, ToolRef, WorkflowInput } from "./types";

// --- Phase 2 primitives: workflow() + graph discovery -----------------------
// `workflow()` supersedes the hand-written WorkflowDef above; both are exported
// while the workflows migrate (Phase 4). WorkflowSpec is intentionally NOT
// re-exported from ./types anymore — the interpreter-era spec shape is dead, and
// the name now belongs to workflow()'s argument.
export { workflow } from "./workflow";
export type {
  AgentOutputOf,
  RunContext,
  RunOptions,
  RunResult,
  WorkflowDefinition,
  WorkflowOutcome,
  WorkflowSpec,
} from "./workflow";
export { discoverGraph } from "./discover";
export type {
  DiscoverOptions,
  DiscoveredEdge,
  DiscoveredGraph,
  DiscoveredStage,
  DiscoveryContext,
  DiscoverySeed,
} from "./discover";
export { POLARITIES, stubFromSchema } from "./stub";
export type { StubPolarity } from "./stub";
export { agentEpilogue, agentSession } from "./agent-session";
export type { AgentSession } from "./agent-session";
export { renderMermaid, renderText } from "./render";
export type { RenderOptions } from "./render";
