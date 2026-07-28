// Scripted WorkflowContext — the routing harness.
//
// A WorkflowDef's run() is pure control flow over ctx.stage() calls, so
// routing is testable with zero infrastructure: script what each stage
// returns, run the def, assert the call SEQUENCE. That is the whole risk
// surface of a hard-coded workflow — did it route correctly.
//
// Structurally typed on purpose: this package must not depend on
// @workhorse/workflow (whose own tests consume this harness), and the same
// shape carries over when ctx.stage(id) becomes ctx.run(agent).

/** One stage session's outcome, as the harness models it. */
export interface HarnessStageResult {
  stageId: string;
  control: Record<string, unknown>;
  analysis: string;
  stats?: Record<string, unknown>;
}

/** Per-call stage inputs (upstream results + loop-back context). */
export interface HarnessStageInvocation {
  upstream?: HarnessStageResult[];
  routedFrom?: { stage: string; digest: string };
}

/** The imperative surface a workflow's run() drives. */
export interface HarnessWorkflowContext {
  runId: string;
  task: string;
  inputs: Record<string, string | number | boolean>;
  model?: string;
  stage(id: string, invocation?: HarnessStageInvocation): Promise<HarnessStageResult>;
}

/** One recorded stage invocation. */
export interface StageCall {
  /** Stage id (1-based order is the array index). */
  id: string;
  /** Which stage routed back here, when this call is a loop-back. */
  routedFrom?: string;
  /** Ids of the upstream results fed into this call. */
  upstream: string[];
  /** How many times this stage had been called BEFORE this call. */
  priorVisits: number;
}

/**
 * Script a stage's control block. Receives the stage id, the calls so far
 * (this one last), and the invocation — so a script can vary by visit count
 * ("fail the first review, pass the second") without external counters.
 */
export type StageScript =
  | Record<string, Record<string, unknown>>
  | ((id: string, calls: StageCall[], invocation?: HarnessStageInvocation) => Record<string, unknown> | void);

export interface WorkflowHarnessOptions {
  runId?: string;
  task?: string;
  inputs?: Record<string, string | number | boolean>;
  model?: string;
  /** Custom analysis text per stage; defaults to a recognizable placeholder. */
  analysis?: (id: string, visit: number) => string;
}

export interface WorkflowHarness {
  ctx: HarnessWorkflowContext;
  /** Every stage call, in order. */
  readonly calls: StageCall[];
  /** Stage ids in call order — the primary routing assertion. */
  sequence(): string[];
  /** How many times a stage ran. */
  visits(id: string): number;
  /** Every call to one stage, in order. */
  callsTo(id: string): StageCall[];
  /** Did `to` ever run as a loop-back from `from`? */
  routed(from: string, to: string): boolean;
}

/**
 * Build a scripted workflow context.
 *
 *   const h = workflowHarness({ plan: { todos: [{ id: "t1" }] }, review: { verdict: "pass" } });
 *   await coding.run(h.ctx);
 *   expect(h.sequence()).toEqual(["enrich", "plan", "implement", "review", "pr-write"]);
 *
 * A stage with no script entry returns an empty control block.
 */
export function workflowHarness(
  script: StageScript = {},
  options: WorkflowHarnessOptions = {},
): WorkflowHarness {
  const calls: StageCall[] = [];

  const controlFor = (id: string, invocation?: HarnessStageInvocation): Record<string, unknown> => {
    if (typeof script === "function") return script(id, calls, invocation) ?? {};
    return script[id] ?? {};
  };

  const ctx: HarnessWorkflowContext = {
    runId: options.runId ?? "run-1",
    task: options.task ?? "do the thing",
    inputs: options.inputs ?? {},
    ...(options.model ? { model: options.model } : {}),

    async stage(id, invocation) {
      const priorVisits = calls.filter((c) => c.id === id).length;
      calls.push({
        id,
        routedFrom: invocation?.routedFrom?.stage,
        upstream: (invocation?.upstream ?? []).map((u) => u.stageId),
        priorVisits,
      });

      return {
        stageId: id,
        control: controlFor(id, invocation),
        analysis: options.analysis?.(id, priorVisits + 1) ?? `analysis for ${id} (visit ${priorVisits + 1})`,
      };
    },
  };

  return {
    ctx,
    calls,
    sequence: () => calls.map((c) => c.id),
    visits: (id) => calls.filter((c) => c.id === id).length,
    callsTo: (id) => calls.filter((c) => c.id === id),
    routed: (from, to) => calls.some((c) => c.id === to && c.routedFrom === from),
  };
}

/**
 * A harness whose named stage throws — for asserting a workflow propagates a
 * hard failure instead of swallowing it. The error is thrown as-is, so pass a
 * real StageFailure/ThrottledPark from the workflow package when the test
 * cares about the type.
 */
export function failingStageHarness(
  failAt: string,
  error: Error,
  script: StageScript = {},
  options: WorkflowHarnessOptions = {},
): WorkflowHarness {
  const harness = workflowHarness(script, options);
  const inner = harness.ctx.stage.bind(harness.ctx);

  harness.ctx.stage = async (id, invocation) => {
    const result = await inner(id, invocation);
    if (id === failAt) throw error;
    return result;
  };

  return harness;
}
