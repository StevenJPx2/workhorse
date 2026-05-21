/**
 * Plugin skill types for injecting instructions into agent prompts.
 *
 * Skills are static markdown instructions that plugins register.
 * They're included in every agent prompt when the plugin is loaded.
 *
 * @module workflow/orchestrator/types/skills
 */
import { z } from "zod";

/**
 * Zod schema for PluginSkill input - validates and sets defaults.
 */
export const PluginSkillSchema = z
  .object({
    /** Unique identifier: "pluginName:skillName" (e.g., "github:pr-workflow") */
    id: z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/, {
      message:
        "Skill ID must be in format 'plugin:skill' using lowercase alphanumeric and hyphens",
    }),

    /** Human-readable name for logging/debugging */
    name: z.string().min(1).max(100),

    /** Short description of what this skill teaches */
    description: z.string().min(1).max(500),

    /** Inline markdown instructions */
    instructions: z.string().optional(),

    /** Relative path to .md file in plugin package */
    instructionsPath: z.string().optional(),

    /** Ordering in prompt (lower = earlier, default: 50) */
    priority: z.number().int().min(0).max(100).optional().default(50),
  })
  .refine((s) => Boolean(s.instructions) !== Boolean(s.instructionsPath), {
    message:
      "Exactly one of 'instructions' or 'instructionsPath' must be provided",
  });

/**
 * Input type for skill registration (before Zod normalization).
 */
export type PluginSkillInput = z.input<typeof PluginSkillSchema>;

/**
 * Normalized skill type (after Zod transform).
 */
export type PluginSkill = z.infer<typeof PluginSkillSchema>;

/**
 * A skill with resolved instructions (file loaded if path was provided).
 */
export interface ResolvedSkill {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description */
  description: string;

  /** Resolved markdown instructions (always present) */
  instructions: string;

  /** Sort priority (lower = earlier) */
  priority: number;
}
