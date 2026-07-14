import z from "zod";

import { PresetConfig } from "./preset";

/** A spawnable helper; tools and write_globs cap what its parent may grant. */
export const SubAgentConfig = z.object({
  agent: z.string().optional(),
  model: z.string().optional(),
  name: z.string(),
  tools: z.array(z.string()).optional(),
  write_globs: z.array(z.string()).optional(),
});

export type SubAgentConfigT = z.infer<typeof SubAgentConfig>;

/** A library step: a preset reference plus any fields that override it. */
export const StepConfig = PresetConfig.extend({
  preset: z.string().optional(),
  sub_agents: z.array(SubAgentConfig).optional(),
});

export type StepConfigT = z.infer<typeof StepConfig>;
