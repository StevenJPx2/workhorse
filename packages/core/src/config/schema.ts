import { z } from "zod/v4";

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
  plugins: z
    .object({
      enabled: z.array(z.string()).default([]),
    })
    .passthrough(), // Allow plugin-specific keys like [plugins.jira]
});
