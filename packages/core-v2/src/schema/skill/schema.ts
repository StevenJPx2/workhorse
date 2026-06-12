import z from "zod";

import type { WorkflowContext } from "#workflow";

export type SkillRenderer = (ctx: WorkflowContext) => string;

export const Skill = z.object({
  description: z.string(),
  instructions: z.string(),
  name: z.string(),
  render: z
    .custom<SkillRenderer>((value) => typeof value === "function")
    .optional(),
  scope: z.string().optional(),
});

export type SkillT = z.infer<typeof Skill>;
