// Scripted RunContext — the routing harness.
//
// A workflow's run() is pure control flow over ctx.run(agent) calls, so tests can
// script agent outputs and assert the call sequence without a model or sandbox.
// This package stays structurally typed and does not import @workhorse/workflow.

export interface HarnessAgent {
  name: string;
}

export interface HarnessRunResult {
  stageId: string;
  output: { control: Record<string, unknown>; analysis: string };
  control: Record<string, unknown>;
  analysis: string;
  stats?: Record<string, unknown>;
}

export interface HarnessRunOptions {
  input?: Record<string, unknown>;
  upstream?: HarnessRunResult[];
  routedFrom?: { stage: string; digest: string };
}

export interface HarnessWorkflowContext {
  runId: string;
  task: string;
  inputs: Record<string, string | number | boolean>;
  model?: string;
  run(agent: HarnessAgent, options?: HarnessRunOptions): Promise<HarnessRunResult>;
}

export interface StageCall {
  id: string;
  routedFrom?: string;
  upstream: string[];
  priorVisits: number;
}

export type StageScript =
  | Record<string, Record<string, unknown>>
  | ((id: string, calls: StageCall[], invocation?: HarnessRunOptions) => Record<string, unknown> | void);

export interface WorkflowHarnessOptions {
  runId?: string;
  task?: string;
  inputs?: Record<string, string | number | boolean>;
  model?: string;
  analysis?: (id: string, visit: number) => string;
}

export interface WorkflowHarness {
  ctx: HarnessWorkflowContext;
  readonly calls: StageCall[];
  sequence(): string[];
  visits(id: string): number;
  callsTo(id: string): StageCall[];
  routed(from: string, to: string): boolean;
}

export function workflowHarness(
  script: StageScript = {},
  options: WorkflowHarnessOptions = {},
): WorkflowHarness {
  const calls: StageCall[] = [];
  const controlFor = (id: string, invocation?: HarnessRunOptions): Record<string, unknown> => {
    if (typeof script === "function") return script(id, calls, invocation) ?? {};
    return script[id] ?? {};
  };

  const ctx: HarnessWorkflowContext = {
    runId: options.runId ?? "run-1",
    task: options.task ?? "do the thing",
    inputs: options.inputs ?? {},
    ...(options.model ? { model: options.model } : {}),

    async run(agent, invocation) {
      const priorVisits = calls.filter((call) => call.id === agent.name).length;
      calls.push({
        id: agent.name,
        routedFrom: invocation?.routedFrom?.stage,
        upstream: (invocation?.upstream ?? []).map((result) => result.stageId),
        priorVisits,
      });

      const control = controlFor(agent.name, invocation);
      const analysis = options.analysis?.(agent.name, priorVisits + 1) ?? `analysis for ${agent.name} (visit ${priorVisits + 1})`;
      return { stageId: agent.name, output: { control, analysis }, control, analysis };
    },
  };

  return {
    ctx,
    calls,
    sequence: () => calls.map((call) => call.id),
    visits: (id) => calls.filter((call) => call.id === id).length,
    callsTo: (id) => calls.filter((call) => call.id === id),
    routed: (from, to) => calls.some((call) => call.id === to && call.routedFrom === from),
  };
}

export function failingStageHarness(
  failAt: string,
  error: Error,
  script: StageScript = {},
  options: WorkflowHarnessOptions = {},
): WorkflowHarness {
  const harness = workflowHarness(script, options);
  const inner = harness.ctx.run.bind(harness.ctx);

  harness.ctx.run = async (agent, invocation) => {
    const result = await inner(agent, invocation);
    if (agent.name === failAt) throw error;
    return result;
  };

  return harness;
}
