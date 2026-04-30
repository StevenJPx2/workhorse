import z from "zod";

/**
 * Zod schema for validating JiratownConfig.
 *
 * Use this to validate config files or programmatically created configs.
 */
export const jiratownConfigSchema = z.object({
  agent: z.object({
    harness: z.string().default("pi-coding-agent"),
    model: z.string().optional(),
  }),
  behavior: z.object({
    autoResume: z.boolean().default(true),
    pollInterval: z.number().int().positive().default(30_000),
  }),
  prompt: z.object({
    custom: z.string().optional(),
  }),
  ui: z.object({
    theme: z.string().default("tokyonight"),
  }),
  steering: z
    .object({
      enabled: z.boolean().default(true),
      debounceMs: z.number().int().positive().default(2000),
      maxReminders: z.number().int().positive().default(3),
      cooldownMs: z.number().int().positive().default(30000),
    })
    .default({
      enabled: true,
      debounceMs: 2000,
      maxReminders: 3,
      cooldownMs: 30000,
    }),
  plugins: z
    .object({
      enabled: z.array(z.string()).default([]),
    })
    .passthrough(), // Allow plugin-specific keys like [plugins.jira]
});
