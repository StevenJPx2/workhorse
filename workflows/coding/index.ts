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

import { workflow } from "@workhorse/workflow";
import { coder, enricher, planner, reviewer, therapist, writer } from "./agents";

/**
 * How many times a failing review may route back to the coder for the SAME todo.
 *
 * Two is deliberate: the first retry fixes an oversight, the second fixes a
 * misunderstanding, and a third almost always means the todo was wrong rather than
 * the code — which the reviewer's findings will say, in the PR, where a human can
 * see it.
 */
const MAX_REVIEW_LOOPS = 2;

/**
 * Absolute ceiling on coder sessions per run, however many todos the planner
 * produced. A runaway plan should cost a bounded amount, not an unbounded one.
 */
const HARD_TODO_CAP = 25;

export const coding = workflow({
  name: "coding",
  description:
    "Multi-agent PR pipeline: enrich the request, break it into todos, implement and adversarially review each " +
    "todo, keep a visual PR body, open a PR, and revise on feedback via a feedback-collating therapist.",

  async run(ctx) {
    // A revision run collates the inbound feedback before re-enriching, so the
    // brief the coder receives is already reconciled rather than raw.
    const isRevision = ctx.runId.includes("-rev");
    const brief = isRevision
      ? await ctx.run(enricher, { upstream: [await ctx.run(therapist)] })
      : await ctx.run(enricher);

    const plan = await ctx.run(planner, { upstream: [brief] });

    // +2 headroom over the planner's count: the coder may legitimately discover a
    // todo the plan missed, and stopping exactly at the planned count would leave
    // it unfinished.
    const planned = plan.output.control.todos.length;
    const cap = Math.min(Math.max(planned, 1) + 2, HARD_TODO_CAP);

    // The PR body accumulates. Each writer session returns the FULL body, so the
    // last one's analysis is the PR description — seeded with the brief so the
    // first todo has context to write against.
    let body = brief;

    for (let todo = 0; todo < cap; todo++) {
      let impl = await ctx.run(coder, { upstream: [brief, plan] });
      let review = await ctx.run(reviewer, { upstream: [impl] });

      for (let attempt = 0; attempt < MAX_REVIEW_LOOPS && review.output.control.verdict === "fail"; attempt++) {
        impl = await ctx.run(coder, {
          upstream: [brief, plan],
          routedFrom: { stage: reviewer.name, digest: review.analysis },
        });
        review = await ctx.run(reviewer, { upstream: [impl] });
      }

      // The coder's own judgement decides whether the write-up captures a visual;
      // the input is what turns the capture tools on.
      body = await ctx.run(writer, {
        input: { uiChanges: impl.output.control.uiChanges },
        upstream: [brief, impl, review, body],
      });

      if (impl.output.control.todosRemaining <= 0) break;
    }

    return { outcome: "pr", summary: body.analysis.slice(0, 200) };
  },
});

export { coder, enricher, planner, reviewer, therapist, writer } from "./agents";
export default coding;
