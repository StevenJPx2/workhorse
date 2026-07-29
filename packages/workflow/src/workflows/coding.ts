// The `coding` workflow — the fleet's primary daily driver: a multi-agent PR
// pipeline. enrich → plan (todos) → per-todo [implement → review↺ → pr-write] →
// PR + park; on review feedback the spine re-invokes run() with a `-rev` runId,
// which routes through the therapist to collate feedback back into enrich.
//
// Agents (blocks in sandbox/agents/): enricher, planner, pr-coder, pr-reviewer,
// pr-writer, therapist. The visual-vs-text PR write is TWO stages sharing the
// pr-writer persona but differing in tool allowlist (the stage's tools[] is the
// gate); run() picks between them on the coder's self-declared uiChanges signal.

import type { StageSpec } from "../types";
import { type WorkflowContext, type WorkflowDef, type WorkflowResult, stageDigest } from "../context";

const TODOS_SCHEMA = {
  type: "object" as const,
  properties: {
    todos: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: { id: { type: "string" as const }, title: { type: "string" as const } },
        required: ["id", "title"],
      },
    },
  },
  required: ["todos"],
};

const IMPL_SCHEMA = {
  type: "object" as const,
  properties: {
    todoId: { type: "string" as const },
    uiChanges: { type: "boolean" as const },
    todosRemaining: { type: "number" as const },
  },
  required: ["uiChanges", "todosRemaining"],
};

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

// Read-only knowledge-gathering surface, shared by enrich + therapist.
const GATHER_TOOLS: StageSpec["tools"] = [
  { name: "read", classification: "read-only" },
  { name: "grep", classification: "read-only" },
  { name: "find", classification: "read-only" },
  { name: "ls", classification: "read-only" },
  { name: "bash", classification: "read-only" },
  { name: "memory_search", classification: "read-only", optional: true },
  { name: "search_fleet_knowledge", classification: "read-only", optional: true },
  { name: "fetch_context", classification: "read-only", optional: true },
  { name: "browser_open", classification: "read-only", optional: true },
  { name: "browser_read", classification: "read-only", optional: true },
  { name: "web_search", classification: "read-only", optional: true },
  { name: "web_read", classification: "read-only", optional: true },
  { name: "gh_pr", classification: "read-only", optional: true },
  { name: "gh_ci", classification: "read-only", optional: true },
  { name: "gh_issue", classification: "read-only", optional: true },
  { name: "gh_search_code", classification: "read-only", optional: true },
  { name: "run_code", classification: "read-only", optional: true },
];

const stages: StageSpec[] = [
  {
    id: "enrich",
    type: "single",
    agent: "enricher",
    readOnly: true,
    thinking: "medium",
    tools: [...GATHER_TOOLS, { name: "find_workflow", classification: "read-only", optional: true }],
    prompt:
      "Turn the request into ONE high-quality, self-contained task brief. Read every attached ref " +
      "(fetch_context), ground it in the actual repository and prior fleet knowledge (memory_search, " +
      "search_fleet_knowledge), and pull any external docs/URLs it points to. Batch wide exploration with " +
      "run_code. Resolve ambiguity by evidence; state any assumption you must make. Output a crisp brief: the " +
      "real objective, constraints, files/areas involved, conventions to honor, risks, and how success is judged.",
    output: { analysis: { required: true }, maxDigestChars: 3000 },
    notifications: "read",
  },
  {
    id: "plan",
    type: "single",
    agent: "planner",
    from: "enrich",
    readOnly: true,
    thinking: "medium",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "memory_search", classification: "read-only", optional: true },
      { name: "fetch_context", classification: "read-only", optional: true },
      { name: "todo_write", classification: "read-only", optional: true },
      { name: "todo_read", classification: "read-only", optional: true },
      { name: "run_code", classification: "read-only", optional: true },
    ],
    prompt:
      "Decompose the enriched brief into an ordered list of independent, verifiable todos (optionally with " +
      "subtasks). Call todo_write with the full ordered list, then restate them in your submit_work control as " +
      "`todos: [{id, title}]`. The workflow runs the coder once per todo in order, so each must be self-contained " +
      "and sequenced so earlier todos don't depend on later ones.",
    output: { analysis: { required: true }, maxDigestChars: 2000, controlSchema: TODOS_SCHEMA },
  },
  {
    id: "implement",
    type: "single",
    agent: "pr-coder",
    from: "plan",
    thinking: "low",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "edit", classification: "write-capable" },
      { name: "write", classification: "write-capable" },
      { name: "bash", classification: "write-capable" },
      { name: "memory_search", classification: "read-only", optional: true },
      { name: "memory_write", classification: "write-capable", optional: true },
      { name: "fetch_context", classification: "read-only", optional: true },
      { name: "todo_read", classification: "read-only", optional: true },
      { name: "todo_update", classification: "write-capable", optional: true },
      { name: "list_scripts", classification: "read-only", optional: true },
      { name: "run_script", classification: "write-capable", optional: true },
      { name: "write_script", classification: "write-capable", optional: true },
      { name: "run_code", classification: "write-capable", optional: true },
    ],
    prompt:
      "Complete exactly ONE todo, then stop. todo_read to see the plan; pick the next pending todo, todo_update it " +
      "to in_progress. Implement only that todo following the brief and repo conventions — no drive-by changes. " +
      "Verify: run the repo's checks/tests for what you touched, then `git add -A && git diff --cached --stat`. " +
      "todo_update the todo to done only when it's actually complete. submit_work control MUST include: todoId, " +
      "uiChanges (true if the change is something a user sees/interacts with — routes the PR write-up), and " +
      "todosRemaining (count of still-pending todos after this one). If routed back from review, address every " +
      "finding on the same branch.",
    output: { analysis: { required: true }, maxDigestChars: 2000, controlSchema: IMPL_SCHEMA },
  },
  {
    id: "review",
    type: "single",
    agent: "pr-reviewer",
    from: "implement",
    readOnly: true,
    thinking: "medium",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "bash", classification: "read-only" },
      { name: "memory_search", classification: "read-only", optional: true },
      { name: "todo_read", classification: "read-only", optional: true },
      { name: "gh_ci", classification: "read-only", optional: true },
      { name: "run_code", classification: "read-only", optional: true },
    ],
    prompt:
      "Adversarially review the current todo's implementation (git diff HEAD) against the brief and that todo: " +
      "correctness, regressions, and repo hygiene. Run the repo's tests and linters via bash — a change that fails " +
      "them is a fail. Report control: verdict pass|fail with blocking[] (file, problem, why) and nits[]. Only " +
      "genuine defects are blocking; a sound change passes with empty blocking.",
    output: { analysis: { required: true }, maxDigestChars: 2500, controlSchema: VERDICT_SCHEMA },
  },
  {
    id: "pr-write",
    type: "single",
    agent: "pr-writer",
    from: "review",
    readOnly: true,
    thinking: "low",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "bash", classification: "read-only" },
      { name: "todo_read", classification: "read-only", optional: true },
    ],
    prompt:
      "Update the PR body for the just-completed todo (a pure code/logic change — no user-visible surface). You are " +
      "given the brief, the todo, its diff, the review, and the PR body so far. Return the COMPLETE updated body as " +
      "your analysis (it becomes the PR description verbatim): a one-paragraph overall summary, then one short " +
      "section per completed todo. Prefer a concise USAGE example over the implementation diff. Clean GFM markdown.",
    output: { analysis: { required: true }, maxDigestChars: 8000 },
    outcome: "pr",
  },
  {
    id: "pr-write-visual",
    type: "single",
    agent: "pr-writer",
    from: "review",
    readOnly: true,
    thinking: "low",
    tools: [
      { name: "read", classification: "read-only" },
      { name: "grep", classification: "read-only" },
      { name: "find", classification: "read-only" },
      { name: "ls", classification: "read-only" },
      { name: "bash", classification: "read-only" },
      { name: "todo_read", classification: "read-only", optional: true },
      { name: "browser_open", classification: "read-only", optional: true },
      { name: "browser_screenshot", classification: "read-only", optional: true },
      { name: "browser_record", classification: "read-only", optional: true },
      { name: "upload_image", classification: "read-only", optional: true },
    ],
    prompt:
      "Update the PR body for the just-completed todo, which CHANGED SOMETHING A USER SEES. You are given the brief, " +
      "the todo, its diff, the review, and the PR body so far. Prioritize a VISUAL explanation: screenshot the " +
      "affected page/URL (browser_screenshot, or browser_record for a flow → GIF), upload_image to get a public URL, " +
      "and embed it with ![desc](url). Never fabricate a URL — if capture fails, fall back to a usage example. " +
      "Return the COMPLETE updated body as your analysis: a one-paragraph summary, then one section per todo. GFM.",
    output: { analysis: { required: true }, maxDigestChars: 8000 },
    outcome: "pr",
  },
  {
    id: "therapist",
    type: "single",
    agent: "therapist",
    readOnly: true,
    thinking: "medium",
    tools: GATHER_TOOLS,
    prompt:
      "The PR parked for review and feedback arrived (in the task). Collate it into ONE grounded revision brief: " +
      "separate signal from noise, ground each actionable point in the current branch/diff (git via bash), PR " +
      "threads (gh_pr) and CI (gh_ci), and any referenced Slack/Jira threads (fetch_context). Output an ordered list " +
      "of concrete changes to make on the existing branch — what, where, why — plus any conflicts to resolve.",
    output: { analysis: { required: true }, maxDigestChars: 3000 },
    notifications: "read",
  },
];

const MAX_REVIEW_LOOPS = 2;
const HARD_TODO_CAP = 25;

export const coding: WorkflowDef = {
  name: "coding",
  description:
    "Multi-agent PR pipeline: enrich the request, break it into todos, implement + adversarially review each todo, " +
    "keep a visual PR body, open a PR, and revise on feedback via a feedback-collating therapist.",
  defaults: { agent: "pr-coder" },
  stages,

  async run(ctx: WorkflowContext): Promise<WorkflowResult> {
    // Steps 1-2 (+ 8 on revision): produce the grounded brief. A revision run
    // (spine re-invokes with a `-rev` runId and feedback in ctx.task) first
    // collates that feedback through the therapist, then re-enriches.
    const isRevision = ctx.runId.includes("-rev");
    let brief;
    if (isRevision) {
      const therapy = await ctx.stage("therapist");
      brief = await ctx.stage("enrich", { upstream: [therapy] });
    } else {
      brief = await ctx.stage("enrich");
    }

    // Step 3: decompose into todos.
    const plan = await ctx.stage("plan", { upstream: [brief] });
    const todos = Array.isArray(plan.control.todos) ? (plan.control.todos as Array<{ id: string; title: string }>) : [];
    const cap = Math.min(Math.max(todos.length, 1) + 2, HARD_TODO_CAP);

    // Steps 4-7: per-todo loop. The coder self-selects the next pending todo
    // (via todo_read); run() drives implement → review↺ → pr-write and stops
    // when the coder reports no todos remaining. The PR body accumulates: each
    // pr-write returns the FULL body, so the last one's analysis is the PR
    // description the spine delivers.
    let body = brief; // seeds "PR body so far" (empty on the first todo)
    for (let i = 0; i < cap; i++) {
      let impl = await ctx.stage("implement", { upstream: [brief, plan] });

      // Review, looping back to the coder on a failing verdict (bounded).
      let review = await ctx.stage("review", { upstream: [impl] });
      for (let attempt = 0; attempt < MAX_REVIEW_LOOPS && review.control.verdict === "fail"; attempt++) {
        impl = await ctx.stage("implement", {
          upstream: [brief, plan],
          routedFrom: { stage: "review", digest: stageDigest(review) },
        });
        review = await ctx.stage("review", { upstream: [impl] });
      }

      // Step 6: PR-body write — visual or text, on the coder's declared signal.
      const visual = impl.control.uiChanges === true;
      body = await ctx.stage(visual ? "pr-write-visual" : "pr-write", {
        upstream: [brief, impl, review, body],
      });

      // Step 7: stop when no todos remain.
      if (Number(impl.control.todosRemaining ?? 0) <= 0) break;
    }

    // Step 7/9: open the PR and park; the spine's reviewLoop handles park →
    // wake-on-signal → (merge = done) | (feedback = re-invoke this run()).
    return { outcome: "pr", summary: String(body.analysis).slice(0, 200) };
  },
};
