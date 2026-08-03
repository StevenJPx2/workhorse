// The `coding` workflow — the fleet's daily driver.
//
//   enrich → plan → per todo [ implement → review ↺ → pr-write ] → PR + park
//
// On PR feedback the spine re-invokes run() with a `-rev` runId, which routes
// through the therapist to collate that feedback before re-enriching.
//
// The pipeline is ordinary control flow: the per-todo loop is a `for`, the review
// retry is a nested `for`, and the visual-vs-text choice is a ternary. There is no
// spec to interpret, and the stage graph is DERIVED from this function rather than
// declared beside it.

import type { AgentDefinition, EngineTool } from "@workhorse/api";
import { agent } from "@workhorse/api";
import { browser_open, browser_read } from "@workhorse/browser/tools";
import { web_read, web_search } from "@workhorse/search/tools";
import { workflow } from "@workhorse/workflow";
import { coder, enricher, planner, reviewer, therapist, writer } from "./agents";
import { PROSE_OUTPUT } from "./agents/schemas";
import { runCoding } from "./pipeline";

/**
 * How many times a failing review may route back to the coder for the SAME todo.
 *
 * Two is deliberate: the first retry fixes an oversight, the second fixes a
 * misunderstanding, and a third almost always means the todo was wrong rather than
 * the code — which the reviewer's findings will say, in the PR, where a human can
 * see it.
 */
function variant<A extends AgentDefinition>(source: A, engineTools: EngineTool[]): A {
  return Object.freeze({ ...source, engineTools }) as A;
}

export function makeCodingWorkflow(options: { name?: string; stripEngineTools?: boolean } = {}) {
  const strip = options.stripEngineTools === true;
  const enrich = strip ? variant(enricher, []) : enricher;
  const plan = strip ? variant(planner, []) : planner;
  const implement = strip ? variant(coder, []) : coder;
  const review = strip ? variant(reviewer, []) : reviewer;
  const therapy = strip ? variant(therapist, []) : therapist;

  return workflow({
    name: options.name ?? "coding",
    description:
      "Multi-agent PR pipeline: enrich the request, break it into todos, implement and adversarially review each " +
      "todo, keep a visual PR body, open a PR, and revise on feedback via a feedback-collating therapist.",

    run: (ctx) => runCoding(ctx, { enrich, plan, implement, review, therapy, writer }),
  });
}

export const coding = makeCodingWorkflow();
export const codingNocode = makeCodingWorkflow({ name: "coding-nocode", stripEngineTools: true });

/** Single-agent baseline used by the agent-vs-workflow evaluation. */
const rawCoder = agent({
  name: "do",
  thinking: "low",
  engineTools: ["run_script"],
  tools: ({ input }) => [
    ...coder.tools({ input }),
    browser_open,
    browser_read,
    web_search,
    web_read,
  ],
  output: PROSE_OUTPUT,
  instructions: `
You are the only agent on this task. Implement the runtime task end to end in one
session. Study the repository first, then make the requested changes. Check prior
memory and fleet knowledge before debugging non-obvious behavior. Run the relevant
tests, lint, and typecheck before you finish. Include the staged diff summary in
your analysis. Do not invent a completion claim without checking the files.
`.trim(),
});

export const codingRaw = workflow({
  name: "coding-raw",
  description: "Single-agent baseline: one agent implements and checks the task, then opens a PR.",
  async run(ctx) {
    const result = await ctx.run(rawCoder);
    return { outcome: "pr", summary: result.analysis.slice(0, 200) };
  },
});

export { coder, enricher, planner, reviewer, therapist, writer } from "./agents";
export default coding;
