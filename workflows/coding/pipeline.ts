import type { RunContext, WorkflowOutcome } from "@workhorse/workflow";
import type { coder, enricher, planner, reviewer, therapist, writer } from "./agents";

type CodingAgents = {
  enrich: typeof enricher;
  plan: typeof planner;
  implement: typeof coder;
  review: typeof reviewer;
  therapy: typeof therapist;
  writer: typeof writer;
};

const MAX_REVIEW_LOOPS = 2;
const HARD_TODO_CAP = 25;

/** Execute the coding pipeline with the supplied agent variants. */
export async function runCoding(ctx: RunContext, agents: CodingAgents): Promise<WorkflowOutcome> {
  const isRevision = ctx.runId.includes("-rev");
  const brief = isRevision
    ? await ctx.run(agents.enrich, { upstream: [await ctx.run(agents.therapy)] })
    : await ctx.run(agents.enrich);
  const plan = await ctx.run(agents.plan, { upstream: [brief] });
  const planned = plan.output.control.todos.length;
  const cap = Math.min(Math.max(planned, 1) + 2, HARD_TODO_CAP);
  let body = brief;

  for (let todo = 0; todo < cap; todo++) {
    let impl = await ctx.run(agents.implement, { upstream: [brief, plan] });
    let review = await ctx.run(agents.review, { upstream: [impl] });

    for (let attempt = 0; attempt < MAX_REVIEW_LOOPS && review.output.control.verdict === "fail"; attempt++) {
      impl = await ctx.run(agents.implement, {
        upstream: [brief, plan],
        routedFrom: { stage: agents.review.name, digest: review.analysis },
      });
      review = await ctx.run(agents.review, { upstream: [impl] });
    }

    body = await ctx.run(agents.writer, {
      input: { uiChanges: impl.output.control.uiChanges },
      upstream: [brief, impl, review, body],
    });

    if (impl.output.control.todosRemaining <= 0) break;
  }

  return { outcome: "pr", summary: body.analysis.slice(0, 200) };
}
