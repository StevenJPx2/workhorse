// Output contracts for the coding pipeline's agents.
//
// Shared here rather than inline in each agent because run() routes on these
// fields, so the workflow and the agent must agree on them — and one schema is
// how they cannot disagree.

import * as v from "valibot";

/** Every stage returns an analysis: the summary its dependents and the human read. */
const analysis = v.string();

/** A stage with nothing to route on. Its analysis is the whole product. */
export const PROSE_OUTPUT = v.object({
  control: v.object({}),
  analysis,
});

export const PLAN_OUTPUT = v.object({
  control: v.object({
    todos: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
      }),
    ),
  }),
  analysis,
});

export const IMPLEMENT_OUTPUT = v.object({
  control: v.object({
    /** Which todo this session completed. */
    todoId: v.optional(v.string()),
    /**
     * Whether the change alters something a user SEES. Routes the PR write-up
     * between the visual and text writers, so it is the coder's judgement that
     * decides whether a screenshot gets taken.
     */
    uiChanges: v.boolean(),
    /** Pending todos AFTER this one. The loop stops at 0. */
    todosRemaining: v.number(),
  }),
  analysis,
});

export const REVIEW_OUTPUT = v.object({
  control: v.object({
    verdict: v.picklist(["pass", "fail"]),
    /** Only genuine defects. A sound change passes with this empty. */
    blocking: v.optional(
      v.array(
        v.object({
          file: v.string(),
          problem: v.string(),
          why: v.optional(v.string()),
        }),
      ),
    ),
    nits: v.optional(v.array(v.string())),
  }),
  analysis,
});

export type PlanOutput = v.InferOutput<typeof PLAN_OUTPUT>;
export type ImplementOutput = v.InferOutput<typeof IMPLEMENT_OUTPUT>;
export type ReviewOutput = v.InferOutput<typeof REVIEW_OUTPUT>;
