// StageRunner — the seam between the engine and how a stage session runs.
//
// The engine owns all workflow semantics (routing, loops, parks, digests)
// and reads a completed stage's verdict from `control.json` + `analysis.md`
// on disk. A StageRunner's ONLY job is to run one stage session to
// completion and leave those two artifacts in the stage dir. Two
// implementations:
//   - pi subprocess (built into the engine, default) — launchSdkSession
//   - flue in-process harness (worker-provided, opt-in via EngineOptions.runner)
// Everything downstream (collectStage/route/loop/digest) is identical for both.

import type { FailureKind, JsonSchema } from "./types";

export interface StageRunInput {
  runId: string;
  stageId: string;
  /** Loop round (1-based) — the stage dir is per-round. */
  round: number;
  /** Absolute stage dir; the runner writes control.json + analysis.md here. */
  dir: string;
  /** Repo working directory inside the container. */
  cwd: string;
  /** Fully assembled prompt (task + upstream + steer + control epilogue). */
  prompt: string;
  /** Base persona/system prompt for the stage. */
  persona: string;
  /** Tool ceiling (bare names; includes "submit_work"). */
  tools: string[];
  /** Repo-write allowlist globs (empty = read-only repo). */
  writeAllow: string[];
  model?: string;
  thinking?: string;
  /** Control contract (inline schema) when the stage declares one. */
  controlSchema?: JsonSchema;
}

export interface StageRunResult {
  /** Session economics for the trace archive + evals. */
  stats?: {
    tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    cost?: number;
    contextPercent?: number | null;
  };
  /** Set when the session could not produce a verdict (engine calls fail()). */
  failure?: { kind: FailureKind; detail: string };
}

export interface StageRunner {
  runStage(input: StageRunInput): Promise<StageRunResult>;
}
