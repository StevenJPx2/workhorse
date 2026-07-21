// Spec → executable plan: resolved stage order, per-stage agent files
// (tool ceilings), and prompt assembly with upstream digests + the
// control-contract epilogue.

import type { JsonSchema, StageSpec, StageState, ToolRef, WorkflowSpec } from "./types";
import { froms } from "./validate";

export const RUN_ROOT = "/workspace/.workflow";

export function runDir(runId: string): string {
  return `${RUN_ROOT}/${runId}`;
}
export function stageDir(runId: string, stageId: string, round: number): string {
  return `${runDir(runId)}/stages/${stageId}/round-${round}`;
}

/** Topological order (stable: declaration order among ready stages). */
export function stageOrder(spec: WorkflowSpec): StageSpec[] {
  const stages = spec.artifactGraph.stages;
  const done = new Set<string>();
  const out: StageSpec[] = [];
  while (out.length < stages.length) {
    const ready = stages.find(
      (s) => !done.has(s.id) && froms(s).every((f) => done.has(f)),
    );
    if (!ready) break; // cycle — validation rejects this upstream
    done.add(ready.id);
    out.push(ready);
  }
  return out;
}

/** The terminal stage (no dependents) — owns the run outcome. */
export function terminalStage(spec: WorkflowSpec): StageSpec {
  const dependents = new Set(spec.artifactGraph.stages.flatMap((s) => froms(s)));
  const terminals = spec.artifactGraph.stages.filter((s) => !dependents.has(s.id));
  return terminals[terminals.length - 1] ?? spec.artifactGraph.stages[spec.artifactGraph.stages.length - 1];
}

export function toolName(t: ToolRef): string {
  return typeof t === "string" ? t : t.name;
}

/**
 * Per-stage session config, mapped to Pi CLI flags. The tool ceiling rides
 * `--tools` (a CLI-level allowlist — enforcement, not prompt-begging);
 * persona rides `--append-system-prompt <file>`. An agent BLOCK's
 * frontmatter (`tools: a, b, c`) supplies the ceiling when the stage
 * declares none — stage tools always win.
 */
export function stageSession(stage: StageSpec, baseAgentMd?: string | null): {
  tools: string[];
  persona: string;
} {
  let tools = (stage.tools ?? []).map(toolName);
  if (tools.length === 0 && baseAgentMd) {
    const fm = baseAgentMd.match(/^---\n([\s\S]*?)\n---/);
    const line = fm?.[1].match(/^tools:\s*(.+)$/m)?.[1];
    if (line) tools = line.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return {
    tools,
    persona:
      baseAgentMd?.replace(/^---[\s\S]*?---\s*/, "").trim() ||
      `You are a focused software engineering agent executing the "${stage.id}" stage of a staged workflow. Work only within this stage's scope.`,
  };
}

/** Digest of a completed upstream stage, injected into dependents. */
export function upstreamDigest(
  stageId: string,
  analysis: string | null,
  control: Record<string, unknown> | undefined,
  maxChars: number,
): string {
  const parts = [`### Upstream stage \`${stageId}\``];
  if (control && Object.keys(control).length) {
    parts.push("Control: " + JSON.stringify(control));
  }
  if (analysis?.trim()) {
    const a = analysis.trim();
    parts.push(a.length > maxChars ? `${a.slice(0, maxChars)}\n…(truncated)` : a);
  }
  return parts.join("\n\n");
}

export interface PromptParts {
  task: string;
  inputs?: Record<string, string | number | boolean>;
  upstream: string[];
  steer?: string;
  round: number;
  maxRounds?: number;
  previousControl?: Record<string, unknown>;
}

/**
 * Assemble the full prompt for one stage session: task + declared inputs +
 * upstream digests + stage prompt + (loop context) + (steer) + the control
 * contract epilogue.
 */
export function assemblePrompt(
  stage: StageSpec,
  dir: string,
  parts: PromptParts,
): string {
  const sections: string[] = [];
  sections.push(`# Task\n\n${parts.task}`);
  if (parts.inputs && Object.keys(parts.inputs).length) {
    sections.push(
      "## Inputs\n\n" +
        Object.entries(parts.inputs)
          .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
          .join("\n"),
    );
  }
  if (parts.upstream.length) {
    sections.push(`## Upstream artifacts\n\n${parts.upstream.join("\n\n")}`);
  }
  sections.push(`## Your stage: ${stage.id}\n\n${stage.prompt}`);
  if (stage.type === "loop") {
    sections.push(
      `## Loop round ${parts.round}${parts.maxRounds ? ` of at most ${parts.maxRounds}` : ""}` +
        (parts.previousControl
          ? `\n\nPrevious round's control: ${JSON.stringify(parts.previousControl)}`
          : ""),
    );
  }
  if (parts.steer) {
    sections.push(
      "## Operator steering (read carefully)\n\n" +
        "A human operator redirected this stage. Their instructions take precedence " +
        `over conflicting parts of the task above:\n\n${parts.steer}`,
    );
  }
  sections.push(controlEpilogue(stage, dir));
  return sections.join("\n\n---\n\n");
}

function controlEpilogue(stage: StageSpec, dir: string): string {
  const wantsAnalysis = stage.output?.analysis?.required !== false;
  const schema = typeof stage.output?.controlSchema === "object" ? stage.output.controlSchema : undefined;
  const lines = [
    "## Completion contract (mandatory)",
    "",
    "Before you finish, write these files:",
  ];
  if (wantsAnalysis) {
    lines.push(
      `1. \`${dir}/analysis.md\` — your findings/summary for the next stage and the human reviewer.`,
    );
  }
  lines.push(
    `${wantsAnalysis ? 2 : 1}. \`${dir}/control.json\` — a single JSON object.` +
      (schema ? ` It MUST match this schema:\n\n\`\`\`json\n${JSON.stringify(schema, null, 1)}\n\`\`\`` : " Include at least `{\"status\": \"done\"}`."),
    "",
    'Escape hatches inside control.json (use only when true):',
    '- `"delegate": true, "delegateReason": "…"` — this task genuinely exceeds your capability (not merely hard); a stronger model will re-run the stage.',
    '- `"inputRequest": {"title": "…", "schema": {JSON schema}}` — you need operator input to proceed; the run parks until they answer, then this stage re-runs with `inputs.operator` filled.',
    "",
    "The run advances ONLY when control.json exists and parses. Do not claim completion in prose.",
  );
  return lines.join("\n");
}

/** Loop-until: "$.key == 'value'" | "$.key != 'value'" | "$.key" (truthy). */
export function untilSatisfied(until: string | undefined, control: Record<string, unknown> | undefined): boolean {
  if (!until) return false;
  if (!control) return false;
  const m = until.trim().match(/^\$\.([\w.]+)\s*(==|!=)?\s*(?:'([^']*)'|"([^"]*)"|(\S+))?$/);
  if (!m) return false;
  const [, pathStr, op, sq, dq, bare] = m;
  let cur: unknown = control;
  for (const key of pathStr.split(".")) {
    if (typeof cur !== "object" || cur === null) return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (!op) return Boolean(cur);
  const raw = sq ?? dq ?? bare ?? "";
  const expected: unknown = raw === "true" ? true : raw === "false" ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  return op === "==" ? cur === expected : cur !== expected;
}

/** JSON schema for an input request or workflow inputs — shared shape. */
export function inputsToSchema(inputs: NonNullable<WorkflowSpec["inputs"]>): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const inp of inputs) {
    properties[inp.name] = {
      type: inp.type === "choice" ? "string" : inp.type,
      description: inp.description,
      ...(inp.type === "choice" ? { enum: inp.options } : {}),
      ...(inp.default !== undefined ? { default: inp.default } : {}),
    };
    if (inp.required) required.push(inp.name);
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** Fresh run-state stage entries in execution order. */
export function initialStages(spec: WorkflowSpec): StageState[] {
  return stageOrder(spec).map((s) => ({ id: s.id, status: "pending", rounds: 0 }));
}
