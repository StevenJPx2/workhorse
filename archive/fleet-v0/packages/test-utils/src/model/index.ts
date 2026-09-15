// @workhorse/test-utils/model — live-model integration harness.
//
// The layer above mocked tests and contract tests. Mocked tests prove a tool
// builds the command it intended; contract tests prove the CLI accepts it;
// these prove a MODEL can actually pick the right tool and fill it in
// correctly. That is the only way to evaluate a tool-surface design — token
// arithmetic says nothing about whether an agent can drive it.
//
// The surface is derived from REAL ToolFactory definitions (descriptions and
// valibot schemas), so a test can never drift from the tools it measures.
//
//   const client = modelClient({ provider: "go", model: "deepseek-v4-flash" });
//   const results = await runToolChoiceEval({
//     client,
//     surfaces: { current: toolSurface(browserTools) },
//     tasks,
//   });
//   console.log(formatComparison(results, client.model));
//
// Gate these behind modelAvailable() so a missing key skips rather than fails.

export { modelAvailable, modelClient, providers } from "./client";
export type { CompletionResult, ModelClient, ModelClientOptions, Provider, ToolCall } from "./client";

export { surfaceWeight, toolSurface } from "./surface";
export type { ModelTool, SurfaceOptions } from "./surface";

export { formatComparison, judge, runToolChoiceEval } from "./score";
export type { Attempt, Expectation, RunOptions, SurfaceResult, Task, TaskResult } from "./score";

export { toolChoiceTasks } from "./tasks";
