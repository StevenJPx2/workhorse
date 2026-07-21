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

// ---------------------------------------------------------------------------
// Run state — ONE json document, owned by the engine, read by the worker.

export type StageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "awaiting-input"
  | "skipped";

/** Typed failure classification — replaces string-regex sniffing. */
export type FailureKind = "model" | "control" | "session" | "timeout" | "input";

export interface StageState {
  id: string;
  status: StageStatus;
  /** Completed loop rounds (single stages: 0 or 1). */
  rounds: number;
  /** Model override (promotion/fallback) — wins over spec/defaults. */
  model?: string;
  /** Live session pid inside the sandbox (running only). */
  pid?: number;
  startedAt?: string;
  completedAt?: string;
  detail?: string;
  failureKind?: FailureKind;
  /** Parsed control.json of the last completed round. */
  control?: Record<string, unknown>;
  /** Pending operator steer, applied on (re)launch. */
  steer?: string;
  /** Input request raised by the stage (awaiting-input only). */
  inputRequest?: { title?: string; schema: JsonSchema };
}

export type RunStatus = "running" | "completed" | "failed" | "awaiting-input" | "cancelled";

export interface RunState {
  engine: "workhorse-workflow";
  version: 1;
  runId: string;
  workflow: string;
  task: string;
  /** Dispatch-time input values (validated against spec.inputs). */
  inputs?: Record<string, string | number | boolean>;
  status: RunStatus;
  stages: StageState[];
  createdAt: string;
  updatedAt: string;
}

/** One drive burst's report — same consumer shape the worker already uses. */
export interface StageDriveReport {
  status: RunStatus;
  tasks: Array<{ id: string; status: StageStatus; detail?: string }>;
  modelFailure?: boolean;
  delegating?: { taskId: string; model?: string; reason?: string };
  awaitingInput?: { stageId: string; request: { title?: string; schema: JsonSchema } };
}
