/**
 * Steering types for idle agent guidance.
 *
 * Plugins register steering rules that fire when an agent goes idle,
 * providing workflow-specific reminders.
 */

import { type ZodType, z } from "zod/v4";
import { IssueStatusSchema } from "#db";

// Forward declaration to avoid circular dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SteeringRuleRef = any;

/**
 * A record of a recently fired hook event.
 */
export interface RecentHookEvent {
  /** Hook name (e.g. "plugin:event.type") - plugins define their own hook namespaces */
  name: string;

  /** Timestamp when the hook fired */
  timestamp: number;

  /** Hook payload (opaque) */
  payload: unknown;
}

/** Transform string | string[] | undefined to string[] (defaults to []) */
const arrayUnionSchema = (zType: ZodType) =>
  z
    .union([zType, z.array(zType)])
    .optional()
    .transform((val) => (val === undefined ? [] : Array.isArray(val) ? val : [val]));

/** Zod schema for SteeringCondition - normalizes and sets defaults */
export const SteeringConditionSchema = z.object({
  status: arrayUnionSchema(IssueStatusSchema),
  source: arrayUnionSchema(z.string()),
  hook: arrayUnionSchema(z.string()),
  when: z
    .function({
      input: [z.any()],
      output: z.union([z.boolean(), z.promise(z.boolean())]),
    })
    .optional()
    .transform((fn) => fn ?? (async () => true)), // Default: always pass if no when() specified
});

/** Zod schema for SteeringRuleConfig - validates, normalizes, and sets defaults */
export const SteeringRuleConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  condition: SteeringConditionSchema.optional().default({
    status: [],
    source: [],
    hook: [],
    when: async () => true,
  }),
  reminder: z
    .union([
      z.string(),
      z.function({
        input: [z.any()],
        output: z.promise(z.string()),
      }),
    ])
    .transform((val) => (typeof val === "function" ? val : (_: SteeringRuleRef) => val)),
  priority: z.number().optional().default(0),
  once: z.boolean().optional().default(false),
});

/** Normalized condition type (after Zod transform) */
export type SteeringCondition = z.infer<typeof SteeringConditionSchema>;

/** Normalized config type (after Zod transform) */
export type SteeringRuleConfig = z.infer<typeof SteeringRuleConfigSchema>;

/** Input type for SteeringRuleConfig (before Zod normalization) */
export type SteeringRuleConfigInput = z.input<typeof SteeringRuleConfigSchema>;
