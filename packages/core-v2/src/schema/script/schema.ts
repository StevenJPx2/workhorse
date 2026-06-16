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

export const Script = z.object({
  args: ScriptArgs.default({ options: [], positional: [] }),
  command: z.string(),
  description: z.string(),
  name: z.string(),
  run: z.custom<ScriptHandler>((value) => typeof value === "function"),
});

export type ScriptT = z.infer<typeof Script>;

export const WriteScriptInput = Script.pick({
  args: true,
  command: true,
  description: true,
  name: true,
});

export type WriteScriptInputT = z.infer<typeof WriteScriptInput>;

export const ScriptUsage = Script.pick({
  args: true,
  description: true,
  name: true,
});

export type ScriptUsageT = z.infer<typeof ScriptUsage>;

export const ScriptParseInput = Script.pick({
  args: true,
  description: true,
}).partial({ description: true });

export type ScriptParseInputT = z.infer<typeof ScriptParseInput>;

export const ScriptParseOutput = Script.pick({
  args: true,
  command: true,
  description: true,
}).partial({ description: true });

export type ScriptParseOutputT = z.infer<typeof ScriptParseOutput>;

export const ScriptSerializeInput = ScriptParseOutput.partial({
  args: true,
});

export type ScriptSerializeInputT = z.infer<typeof ScriptSerializeInput>;

export interface ScriptInvocation {
  options: Record<string, string>;
  positional: string[];
}

export type ScriptHandler = (
  invocation: ScriptInvocation,
  ctx: WorkflowContext,
) => Promise<ToolResultT>;
