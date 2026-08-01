// @workhorse/workflow — workflow() and agent() execution contracts.

export type { Driver, ExecResult } from "./driver";
export { assembleAgentPrompt, stageDir, upstreamDigest } from "./compile";
export type { AgentPromptParts } from "./compile";
export {
  StageFailure,
  ThrottledPark,
} from "./errors";

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
