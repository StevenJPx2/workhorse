import z from "zod";

import type { WorkflowContext } from "#workflow";

import { ScriptUsage } from "../script";

export type SkillRenderer = (ctx: WorkflowContext) => string;

export const Skill = z.object({
  allowed_tools: z.string().optional(),
  compatibility: z.string().optional(),
  description: z.string(),
  dir: z.string().optional(),
  instructions: z.string(),
  license: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  name: z.string(),
  render: z
    .custom<SkillRenderer>((value) => typeof value === "function")
    .optional(),
  resources: z.array(z.string()).optional(),
  scope: z.string().optional(),
  scripts: z.array(ScriptUsage).optional(),
});

export type SkillT = z.infer<typeof Skill>;
