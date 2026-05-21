/**
 * Steering types for idle agent guidance.
 *
 * Plugins register steering rules that fire when an agent goes idle,
 * providing workflow-specific reminders.
 */
import { z } from "zod";

import { IssueSchema, IssueStatusSchema, NotificationSchema } from "#db";

/**
 * A record of a hook event in the history.
 */
export interface HookHistoryEntry {
  /** Hook name (e.g. "plugin:event.type") - plugins define their own hook namespaces */
  name: string;

  /** Timestamp when the hook fired */
  timestamp: number;

  /** Hook payload (opaque) */
  payload: unknown;
}

/** Schema for a tool call in the history. */
export const ToolHistoryEntrySchema = z.object({
  /** Tool name (e.g. "edit", "github_open_pr") */
  name: z.string(),
  /** Arguments passed to the tool */
  args: z.unknown(),
  /** Timestamp when the tool was called */
  timestamp: z.number(),
});

export type ToolHistoryEntry = z.infer<typeof ToolHistoryEntrySchema>;

/**
 * Context passed to `when()` and `reminder()` callbacks.
 * Provides access to issue state, notifications, and tool/hook history.
 */
export const SteeringContextSchema = z.object({
  /** The issue this rule is evaluating for */
  issue: IssueSchema,
  /** Unread notifications for this issue */
  notifications: z.array(NotificationSchema),
  /** History of tool calls made by the agent (consumers can filter by timestamp) */
  toolHistory: z.array(ToolHistoryEntrySchema),
});

export type SteeringContext = z.infer<typeof SteeringContextSchema>;

/** Transform string | string[] | undefined to string[] (defaults to []) */
const arrayUnionSchema = (zType: z.ZodType) =>
  z
    .union([zType, z.array(zType)])
    .optional()
    .transform((val) => {
      if (val === undefined) return [];
      if (Array.isArray(val)) return val;
      return [val];
    });

/** Zod schema for SteeringCondition - normalizes and sets defaults */
export const SteeringConditionSchema = z.object({
  status: arrayUnionSchema(IssueStatusSchema),
  source: arrayUnionSchema(z.string()),
  hook: arrayUnionSchema(z.string()),
  when: z
    .function({
      input: [SteeringContextSchema],
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
        input: [SteeringContextSchema],
        output: z.union([z.string(), z.promise(z.string())]),
      }),
    ])
    .transform((val) =>
      typeof val === "function" ? val : (_: SteeringContext) => val,
    ),
  priority: z.number().optional().default(0),
  once: z.boolean().optional().default(false),
});

/** Normalized condition type (after Zod transform) */
export type SteeringCondition = z.infer<typeof SteeringConditionSchema>;

/** Normalized config type (after Zod transform) */
export type SteeringRuleConfig = z.infer<typeof SteeringRuleConfigSchema>;

/** Input type for SteeringRuleConfig (before Zod normalization) */
export type SteeringRuleConfigInput = z.input<typeof SteeringRuleConfigSchema>;
