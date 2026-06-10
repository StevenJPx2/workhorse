import z from "zod";

/**
 * Built-in transition condition names.
 *
 * These can be extended.
 */
export const ConditionName = z.enum([
  "todos_complete",
  "token_budget_exceeded",
  "step_idle",
  "status_changed",
  "resource_exceeded",
  "review_settled",
  "always",
  "state_check",
]);
export type ConditionNameT = z.infer<typeof ConditionName>;

/** Comparison operators allowed in a `state_check` predicate. */
export const Operator = z.enum([
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "matches",
]);
export type OperatorT = z.infer<typeof Operator>;

/**
 * Known `state_check` keys.
 *
 * These can be extended.
 */
export const BuiltinStateKeys = z.enum([
  "file_exists",
  "git_clean",
  "git_ahead",
  "todo_count",
  "token_used",
  "iteration_count",
  "status",
]);

export type BuiltinStateKeysT = z.infer<typeof BuiltinStateKeys>;
