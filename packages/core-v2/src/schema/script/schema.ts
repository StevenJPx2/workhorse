import z from "zod";

import type { WorkflowContext } from "#workflow";

import type { ToolResultT } from "../tool";

export const ArgSpec = z.object({
  default: z.string().optional(),
  description: z.string(),
  name: z.string(),
  required: z.boolean().optional(),
});

export type ArgSpecT = z.infer<typeof ArgSpec>;

export const OptionSpec = ArgSpec.extend({
  alias: z.string().optional(),
});

export type OptionSpecT = z.infer<typeof OptionSpec>;

export const ScriptArgs = z.object({
  options: z.array(OptionSpec).default([]),
  positional: z.array(ArgSpec).default([]),
});

export type ScriptArgsT = z.infer<typeof ScriptArgs>;

export interface ScriptInvocation {
  options: Record<string, string>;
  positional: string[];
}

export type ScriptHandler = (
  invocation: ScriptInvocation,
  ctx: WorkflowContext,
) => Promise<ToolResultT>;

export const Script = z.object({
  args: ScriptArgs.default({ options: [], positional: [] }),
  command: z.string(),
  description: z.string(),
  name: z.string(),
  run: z.custom<ScriptHandler>((value) => typeof value === "function"),
});

export type ScriptT = z.infer<typeof Script>;
