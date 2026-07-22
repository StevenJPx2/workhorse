// The `coding-raw` workflow — single-stage baseline: one agent plans,
// implements, and self-checks in one session, then opens a PR. No
// plan/implement/verify decomposition, no adversarial loop. The raw-agent
// control the staged `coding` workflow is measured against (agent-vs-workflow
// eval). SCAFFOLDING, like coding.

import type { StageSpec } from "../types";
import type { WorkflowContext, WorkflowDef, WorkflowResult } from "../context";

const stages: StageSpec[] = [
  {
    id: "do",
    type: "single",
    thinking: "low",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "edit", classification: "read-only" },
      { name: "write", classification: "read-only" },
      { name: "bash", classification: "read-only" },
      { name: "ctx_search", classification: "read-only", optional: true },
      { name: "ctx_memory", classification: "write-capable", optional: true },
      { name: "search_fleet_knowledge", classification: "read-only", optional: true },
      { name: "browser_open", classification: "read-only" },
      { name: "browser_read", classification: "read-only" },
      { name: "list_scripts", classification: "read-only", optional: true },
      { name: "run_script", classification: "write-capable", optional: true },
      { name: "web_search", classification: "read-only", optional: true },
      { name: "web_read", classification: "read-only", optional: true },
    ],
    prompt:
      "Implement the runtime task end to end in this one session. Study the repository first (read/grep/find; check ctx_search and search_fleet_knowledge for prior work), then make the code changes following repo conventions, then self-check: run the repo's build/test/lint via bash and confirm git diff --cached --stat looks right. Include that diff stat in your analysis. You are the only agent on this task — there is no separate planner or verifier, so hold yourself to the same bar: no missed requirements, no regressions, conventions followed.",
    output: { analysis: { required: true }, maxDigestChars: 2500 },
    outcome: "pr",
  },
];

export const codingRaw: WorkflowDef = {
  name: "coding-raw",
  description: "Single-stage baseline: one agent implements + self-checks in one session, then opens a PR.",
  defaults: { agent: "coder" },
  stages,

  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const done = await ctx.stage("do");
    return { outcome: "pr", summary: String(done.analysis).slice(0, 200) };
  },
};
