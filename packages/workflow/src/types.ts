// @workhorse/stages — spec + run-state types.
//
// The spec format is a compatible subset of the pi-workflow ArtifactGraph
// spec.json we already ship (registry, builder, and seeds keep working),
// extended with GH-Actions-style `inputs` and outcome/interaction fields
// that owning the engine makes possible.

/** Tool allowlist entry: bare name (built-in) or classified custom tool. */
export type ToolRef =
  | string
  | {
      name: string;
      classification: "read-only" | "write-capable" | "mutation-capable";
      optional?: boolean;
    };

/** Minimal JSON-schema subset used for control validation + input forms. */
export interface JsonSchema {
  type?: "object" | "string" | "number" | "boolean" | "array";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: Array<string | number | boolean>;
  items?: JsonSchema;
  description?: string;
  default?: unknown;
  [k: string]: unknown;
}

/** GH-Actions-style declared workflow input (workflow_dispatch.inputs). */
export interface WorkflowInput {
  name: string;
  type: "string" | "boolean" | "number" | "choice";
  description?: string;
  default?: string | number | boolean;
  required?: boolean;
  options?: string[];
}

export interface StageOutput {
  /** Require an analysis.md from the stage. */
  analysis?: { required?: boolean };
  /** Control contract: inline schema or a path relative to the workflow dir. */
  controlSchema?: string | JsonSchema;
  /** Truncate upstream digests injected into dependents. */
  maxDigestChars?: number;
}

export interface StageSpec {
  id: string;
  /** single = one session; loop = repeat until `until` or maxRounds. */
  type?: "single" | "loop";
  /** Upstream stage(s) whose artifacts this stage consumes. */
  from?: string | string[];
  /** Pi agent name (ships as a generated agent file with a tool ceiling). */
  agent?: string;
  readOnly?: boolean;
  thinking?: "minimal" | "low" | "medium" | "high";
  model?: string;
  tools?: ToolRef[];
  prompt: string;
  output?: StageOutput;
  /** Loop stages: condition over control ("$.reviewStatus == 'complete'"). */
  until?: string;
  maxRounds?: number;
  /** Terminal stage: what the run delivers. Default "pr". */
  outcome?: "pr" | "report" | "artifact";
  /**
   * Repo-write allowlist (globs, relative to the repo root or absolute).
   * When set, the sandbox write gate blocks write/edit outside these
   * patterns. readOnly stages get an empty repo allowlist implicitly;
   * the stage's own artifact dir is always writable.
   */
  writeAllow?: string[];
  /**
   * Notification read point: "read" injects unread operator notifications
   * (queued on the bus) into this stage's prompt at launch.
   */
  notifications?: "read";
  /**
   * Conditional routing over the stage's validated control JSON —
   * deterministic branching (the SYSTEM routes, never the agent's prose).
   * Rules evaluate in order after the stage completes; first match wins:
   *   { when: {verdict: "fail"}, to: "implement" }  → loop back (resets the
   *     target + everything after it; the routed-from stage's control +
   *     analysis are injected into the target's re-run prompt)
   *   { when: {verdict: "pass"}, to: "$end" }       → skip remaining stages
   * `when` is an equality match on top-level control fields; omit it for an
   * unconditional default. No matching rule = natural graph order.
   */
  next?: Array<{ when?: Record<string, unknown>; to: string }>;
  /** Max times this stage's `next` may route BACKWARD (default 2). */
  maxLoopbacks?: number;
  /** Accepted for spec compatibility — inert (dependents of a re-run stage always re-run). */
  inputPolicy?: Record<string, unknown>;
}

export interface WorkflowDefaults {
  agent?: string;
  model?: string;
  readOnly?: boolean;
  thinking?: StageSpec["thinking"];
  maxRuntimeMs?: number;
  [k: string]: unknown;
}

export interface WorkflowSpec {
  schemaVersion: number;
  name: string;
  description?: string;
  defaults?: WorkflowDefaults;
  inputs?: WorkflowInput[];
  artifactGraph: { stages: StageSpec[] };
}

/** Typed failure classification — replaces string-regex sniffing. */
export type FailureKind = "model" | "control" | "session" | "timeout" | "input";
