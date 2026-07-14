import z from "zod";

/** Cascading knobs, seeded global → project → workflow → preset → step. */
export const Settings = z.object({
  agent: z.string().optional(),
  model: z.string().optional(),
  retry: z.number().optional(),
  token_budget: z.number().optional(),
  tool_output_limit: z.number().optional(),
  tool_timeout: z.number().optional(),
});

export type SettingsT = z.infer<typeof Settings>;
