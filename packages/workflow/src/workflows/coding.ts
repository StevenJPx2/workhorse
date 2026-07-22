// The `coding` workflow — plan → implement → adversarial verify, with a
// verify→implement loop-back. SCAFFOLDING (proves the mechanism + feeds the
// agent-vs-workflow eval); real daily drivers are authored later.
//
// The routing that used to be `next` rules in spec.json is now the `for`
// loop in run(). Stages below are the declarative manifest (tools/prompts/
// schema for the graph view + gating); run() is the executable pipeline.

import type { StageSpec } from "../types";
import { type WorkflowContext, type WorkflowDef, type WorkflowResult, stageDigest } from "../context";

const VERDICT_SCHEMA = {
  type: "object" as const,
  properties: {
    verdict: { type: "string" as const, enum: ["pass", "fail"] },
    blocking: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          file: { type: "string" as const },
          problem: { type: "string" as const },
          why: { type: "string" as const },
        },
      },
    },
    nits: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["verdict"],
};

const stages: StageSpec[] = [
  {
    id: "plan",
    type: "single",
    readOnly: true,
    thinking: "low",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "ctx_search", classification: "read-only", optional: true },
      { name: "search_fleet_knowledge", classification: "read-only", optional: true },
      { name: "browser_open", classification: "read-only" },
      { name: "browser_read", classification: "read-only" },
      { name: "list_scripts", classification: "read-only", optional: true },
      { name: "find_tool", classification: "read-only", optional: true },
      { name: "web_search", classification: "read-only", optional: true },
      { name: "web_read", classification: "read-only", optional: true },
    ],
    prompt:
      "FIRST check prior work: list_scripts (the repo's registered tool inventory) and search (ctx_search for this repo's memory, search_fleet_knowledge for distilled traces of every past fleet run) with terms from the task. Reuse what you find. If the task references external docs or a URL, browser_open + browser_read it. Then study the repository and produce a concise implementation plan for the runtime task: which files change and how, repo conventions, risks, and how to verify. End with the exact list of files to be created or modified.",
    output: { analysis: { required: true }, maxDigestChars: 2000 },
  },
  {
    id: "implement",
    type: "single",
    from: "plan",
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
      { name: "list_scripts", classification: "read-only", optional: true },
      { name: "run_script", classification: "write-capable", optional: true },
      { name: "write_script", classification: "write-capable", optional: true },
    ],
    prompt:
      "Implement the upstream plan for the runtime task. Check ctx_search for prior fixes before debugging non-obvious issues. Make the code changes following the plan and repo conventions. When done, verify with bash: git add -A && git diff --cached --stat, and include that diff stat in your analysis. If you learned something durable about this repo (a rule, constraint, gotcha), record it with ctx_memory(action=\"write\"). If your prompt contains a 'Routed back from verify' section, this is a re-run: a verifier rejected the previous attempt — address every blocking finding on the same branch (refine the working-tree work, do not start over).",
    output: { analysis: { required: true }, maxDigestChars: 2000 },
  },
  {
    id: "verify",
    type: "single",
    agent: "verifier",
    from: "implement",
    readOnly: true,
    thinking: "medium",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "bash", classification: "read-only" },
      { name: "ctx_search", classification: "read-only", optional: true },
      { name: "browser_open", classification: "read-only" },
      { name: "browser_read", classification: "read-only" },
      { name: "browser_screenshot", classification: "read-only" },
      { name: "gh_ci", classification: "read-only", optional: true },
    ],
    prompt:
      "You are reviewing another agent's implementation of the runtime task. The change is in the working tree — inspect it with git diff HEAD. Adversarially verify against the original task and the upstream plan: missed requirements, bugs, regressions in touched paths, convention violations. Run any checks the repo offers via bash. If the change affects a web page reachable at a URL, use browser_open + browser_read to inspect its live content. Report via control: verdict pass|fail with blocking[] (each: file, problem, why) and nits[]. Only genuine defects are blocking — a sound implementation gets verdict pass with empty blocking.",
    output: { analysis: { required: true }, maxDigestChars: 2500, controlSchema: VERDICT_SCHEMA },
    notifications: "read",
    outcome: "pr",
  },
];

export const coding: WorkflowDef = {
  name: "coding",
  description:
    "Plan, implement, and adversarially verify a code change; loop back to implement on a failing verdict, then open a PR.",
  defaults: { agent: "coder" },
  stages,

  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    const plan = await ctx.stage("plan");
    let impl = await ctx.stage("implement", { upstream: [plan] });

    // verify→implement loop-back: the `next` rules from the old spec, now
    // ordinary control flow. Bounded (maxLoopbacks 2 in the old spec).
    const MAX_LOOPBACKS = 2;
    for (let attempt = 0; attempt <= MAX_LOOPBACKS; attempt++) {
      const verify = await ctx.stage("verify", { upstream: [impl] });
      if (verify.control.verdict === "pass" || attempt === MAX_LOOPBACKS) {
        return { outcome: "pr", summary: String(verify.analysis).slice(0, 200) };
      }
      // Failing verdict — route back to implement with the verifier's findings.
      impl = await ctx.stage("implement", {
        upstream: [plan],
        routedFrom: { stage: "verify", digest: stageDigest(verify) },
      });
    }
    return { outcome: "pr" };
  },
};
