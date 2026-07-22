// Flue-first workflow contract.
//
// A WorkflowDef replaces an interpreted spec: `stages` is a DECLARATIVE
// manifest (graph view, live status, tool gating — reuses StageSpec), and
// `run(ctx)` is IMPERATIVE routing (the pipeline as ordinary control flow).
// The verify→implement loop that used to be `next` rules in the spec is now
// a `for` loop in run(); the engine interpreter is no longer needed.
//
// `ctx.stage(id, ...)` runs ONE stage as a flue harness session and returns
// its typed verdict. The concrete implementation is injected by the worker
// (it needs the sandbox binding, plugin tools, and the OAuth/model legs);
// the package owns the contract + the defs. Unit tests pass a mock ctx whose
// stage() returns canned results, so routing is validated with no harness.

import type { StageSpec, WorkflowInput } from "./types";

/** One stage session's outcome — the typed verdict + economics. */
export interface StageResult {
  stageId: string;
  /** Parsed control.json (the typed verdict the workflow routes on). */
  control: Record<string, unknown>;
  /** analysis.md — findings/summary for the next stage + reviewer. */
  analysis: string;
  stats?: {
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    cost?: number;
    contextPercent?: number | null;
  };
}

/** Per-call inputs to a stage: which upstream results feed it + loop context. */
export interface StageInvocation {
  /** Completed upstream stage results whose digests seed this stage's prompt. */
  upstream?: StageResult[];
  /**
   * Loop-back context: a downstream verdict routed the workflow back here.
   * The routed-from stage's digest is injected into the re-run prompt.
   */
  routedFrom?: { stage: string; digest: string };
}

/**
 * The imperative surface passed to WorkflowDef.run(). Everything a workflow
 * needs to drive its pipeline; the worker constructs the concrete instance.
 */
export interface WorkflowContext {
  runId: string;
  task: string;
  inputs: Record<string, string | number | boolean>;
  /** Dispatch-time model override (else the stage/def default). */
  model?: string;
  /**
   * Run one stage (by manifest id) as a flue harness session and return its
   * verdict. Throws {@link StageFailure} on a hard failure (auth/session/
   * control) — routing errors are exceptions, not return values, so run()
   * reads like straight-line code. Transient capacity throttles are handled
   * inside (short retry) or surfaced as a durable park to the spine.
   */
  stage(id: string, invocation?: StageInvocation): Promise<StageResult>;
}

/** Thrown by ctx.stage on a hard (non-transient) failure. */
export class StageFailure extends Error {
  constructor(
    readonly stageId: string,
    readonly kind: "model" | "control" | "session" | "timeout" | "input",
    detail: string,
  ) {
    super(`stage ${stageId} failed (${kind}): ${detail}`);
    this.name = "StageFailure";
  }
}

/** What a workflow delivers when run() returns. */
export interface WorkflowResult {
  outcome: "pr" | "report" | "artifact";
  summary?: string;
}

/**
 * A hard-coded, eval-tested workflow. `stages` is descriptive (UI + gating);
 * `run` is the executable routing. Adding a workflow = a def + an eval case,
 * never an uploaded spec — that discipline keeps packages/workflow light.
 */
export interface WorkflowDef {
  name: string;
  description?: string;
  inputs?: WorkflowInput[];
  /** Declarative stage manifest (graph view, live-status tab, tool gating). */
  stages: StageSpec[];
  /** Imperative pipeline: compose ctx.stage() calls with control-flow routing. */
  run(ctx: WorkflowContext): Promise<WorkflowResult>;
}

/** Compact digest of a completed stage for loop-back routing context. */
export function stageDigest(r: StageResult, maxChars = 2000): string {
  const parts: string[] = [];
  if (Object.keys(r.control).length) parts.push("Control: " + JSON.stringify(r.control));
  if (r.analysis.trim()) {
    const a = r.analysis.trim();
    parts.push(a.length > maxChars ? `${a.slice(0, maxChars)}\n…(truncated)` : a);
  }
  return parts.join("\n\n");
}
