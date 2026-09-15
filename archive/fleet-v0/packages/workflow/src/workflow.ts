// `workflow()` — the builder.
//
// A workflow is its run() function. Everything else (which agents it uses, what
// feeds what, where it loops) is DERIVED by running run() against a recording
// context, so there is no second declaration to drift.
//
// The graph is computed lazily on first access, not in the builder: workflow() is
// called at module load, and doing two full run() passes there would make
// importing a workflow package cost real work even when nothing asks for its
// shape.

import type { AgentDefinition } from "@workhorse/api";
import { type DiscoveredGraph, type DiscoveryContext, discoverGraph } from "./discover";

/** One stage's outcome: the agent's validated output plus run economics. */
export interface RunResult<TOutput = unknown> {
  stageId: string;
  output: TOutput;
  /**
   * Legacy accessors, kept because the spine and every existing run() read them.
   * `control` is `output.control` and `analysis` is `output.analysis` when the
   * schema declares them.
   */
  control: Record<string, unknown>;
  analysis: string;
  stats?: {
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    cost?: number;
    contextPercent?: number | null;
    runCodeCalls?: number;
  };
}

/** Options for one `ctx.run()` invocation. */
export interface RunOptions {
  /**
   * Typed, explicit input for this invocation — separate from `upstream` on
   * purpose. Upstream is "what happened before"; input is "what this stage was
   * told", and mixing them makes both untyped.
   */
  input?: Record<string, unknown>;
  /** Completed stage results whose digests seed this stage's prompt. */
  upstream?: RunResult[];
  /** A downstream verdict routed back here; its digest is injected. */
  routedFrom?: { stage: string; digest: string };
}

/** The surface a workflow's run() drives. */
export interface RunContext {
  runId: string;
  task: string;
  inputs: Record<string, string | number | boolean>;
  /** Dispatch-time model override; the agent's own policy wins otherwise. */
  model?: string;
  /** Execute one agent and return its validated output. */
  run<A extends AgentDefinition>(agent: A, options?: RunOptions): Promise<RunResult<AgentOutputOf<A>>>;
}

/** The output type an agent produces. */
export type AgentOutputOf<A> = A extends AgentDefinition<infer S>
  ? S extends { "~standard": { types?: { output: infer O } } }
    ? O
    : unknown
  : unknown;

/** What a workflow delivers. */
export interface WorkflowOutcome {
  outcome: "pr" | "report" | "artifact";
  summary?: string;
}

export interface WorkflowSpec {
  name: string;
  description?: string;
  /** Declared, operator-facing inputs (GH-Actions style). */
  inputs?: Array<{
    name: string;
    type: "string" | "boolean" | "number" | "choice";
    description?: string;
    default?: string | number | boolean;
    required?: boolean;
    options?: string[];
  }>;
  /** Run-wide model default; an agent's own policy wins. */
  model?: string;
  /** The pipeline, as ordinary control flow. */
  run(ctx: RunContext): Promise<WorkflowOutcome>;
}

export interface WorkflowDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputs?: WorkflowSpec["inputs"];
  readonly model?: string;
  run(ctx: RunContext): Promise<WorkflowOutcome>;
  /**
   * The stage graph, derived from run(). Memoized — discovery is two full passes
   * over run(), and the answer cannot change for a given definition.
   */
  graph(): Promise<DiscoveredGraph>;
  /** Every agent the graph reaches, in first-observed order. */
  agents(): Promise<AgentDefinition[]>;
}

/**
 * Declare a workflow.
 *
 * The returned definition exposes `graph()` for the UI, tool-gating, and the
 * Phase-2 gate that the discovered shape matches the intended pipeline.
 */
export function workflow(spec: WorkflowSpec): WorkflowDefinition {
  let cached: Promise<DiscoveredGraph> | undefined;

  const graph = () => {
    // Cache the PROMISE, not the value, so concurrent callers share one discovery
    // rather than racing two.
    cached ??= discoverGraph(spec.run as unknown as (ctx: DiscoveryContext) => Promise<unknown>, {
      runId: `${spec.name}-discover`,
    });
    return cached;
  };

  return Object.freeze({
    name: spec.name,
    description: spec.description,
    inputs: spec.inputs,
    model: spec.model,
    run: spec.run,
    graph,
    agents: async () => (await graph()).stages.map((s) => s.agent),
  });
}
