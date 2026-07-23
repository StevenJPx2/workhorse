// Per-stage session assembly: agent files (tool ceilings), prompt assembly
// with upstream digests + the control-contract epilogue. The worker's
// WorkflowContext (ctx.stage) uses these to run a hard-coded WorkflowDef's
// stages; there is no spec interpreter.

import type { JsonSchema, StageSpec, ToolRef } from "./types";

export const RUN_ROOT = "/workspace/.workflow";

export function runDir(runId: string): string {
  return `${RUN_ROOT}/${runId}`;
}
export function stageDir(runId: string, stageId: string, round: number): string {
  return `${runDir(runId)}/stages/${stageId}/round-${round}`;
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
export function stageSession(
  stage: StageSpec,
  baseAgentMd?: string | null,
): {
  tools: string[];
  persona: string;
  /** Write-gate allowlist (globs) — enforced by the workflow-gate extension. */
  writeAllow: string[];
} {
  let tools = (stage.tools ?? []).map(toolName);
  if (tools.length === 0 && baseAgentMd) {
    const fm = baseAgentMd.match(/^---\n([\s\S]*?)\n---/);
    const line = fm?.[1].match(/^tools:\s*(.+)$/m)?.[1];
    if (line) tools = line.split(",").map((t) => t.trim()).filter(Boolean);
  }
  // One tool per task: completion is submit_work's job (the workflow-gate
  // extension owns it) — a stage never needs general write capability just
  // to finish. Repo edits remain the write/edit tools' job, declared in the
  // stage's own tools[] and bounded by the glob gate when writeAllow is set.
  if (tools.length > 0 && !tools.includes("submit_work")) tools.push("submit_work");

  const writeAllow = stage.writeAllow ?? [];

  let persona =
    baseAgentMd?.replace(/^---[\s\S]*?---\s*/, "").trim() ||
    `You are a focused software engineering agent executing the "${stage.id}" stage of a staged workflow. Work only within this stage's scope.`;
  if (writeAllow.length) {
    persona +=
      "\n\nWrite policy (mechanically enforced): file writes/edits are only permitted on paths matching " +
      `these patterns: ${writeAllow.join(", ")}.`;
  }
  return { tools, persona, writeAllow };
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
  /** Loop-back routing context (the routed-from stage's verdict). */
  routedFrom?: { stage: string; digest: string };
  /** Rendered unread-notifications section (workflow-declared read point). */
  notifications?: string;
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
  if (parts.routedFrom) {
    sections.push(
      `## Routed back from \`${parts.routedFrom.stage}\` (address these findings)\n\n` +
        "A downstream stage evaluated your previous work and routed the workflow back to " +
        "this stage. Fix EVERY blocking finding below — the same check runs again after " +
        `you finish.\n\n${parts.routedFrom.digest}`,
    );
  }
  if (parts.notifications) {
    sections.push(parts.notifications);
  }
  sections.push(controlEpilogue(stage, dir));
  return sections.join("\n\n---\n\n");
}

function controlEpilogue(stage: StageSpec, dir: string): string {
  const schema = typeof stage.output?.controlSchema === "object" ? stage.output.controlSchema : undefined;
  return [
    "## Completion contract (mandatory)",
    "",
    "Finish by calling the `submit_work` tool EXACTLY ONCE with:",
    "- `analysis` — your findings/summary for the next stage and the human reviewer (markdown).",
    "- `control` — a single JSON object." +
      (schema
        ? ` It MUST match this schema:\n\n\`\`\`json\n${JSON.stringify(schema, null, 1)}\n\`\`\``
        : ' Include at least `{"status": "done"}`.'),
    "",
    `(submit_work writes the artifacts into \`${dir}\`.)`,
    "",
    "Escape hatches inside `control` (use only when true):",
    '- `"delegate": true, "delegateReason": "…"` — this task genuinely exceeds your capability (not merely hard); a stronger model will re-run the stage.',
    '- `"inputRequest": {"title": "…", "schema": {JSON schema}}` — you need operator input to proceed; the run parks until they answer, then this stage re-runs with `inputs.operator` filled.',
    "",
    "The run advances ONLY when control.json exists and parses. Do not claim completion in prose.",
  ].join("\n");
}

