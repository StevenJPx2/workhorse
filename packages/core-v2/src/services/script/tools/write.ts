import z from "zod";

import { defineTool, ScriptArgs, type ScriptArgsT } from "#schema";

export type WriteScript = (input: {
  args?: ScriptArgsT;
  command: string;
  description?: string;
  name: string;
}) => void;

export function writeScriptTool(write: WriteScript) {
  return defineTool({
    annotations: {
      destructive_hint: false,
      idempotent_hint: true,
      open_world_hint: false,
      read_only_hint: false,
      title: "Write script",
    },
    description:
      "Save a reusable shell script to the workflow so it can be run later with " +
      "`run_script`. Declare `args` (positional + options) to give it a CLI contract. " +
      "Re-using a name overwrites the existing script.",
    execute: async (input) => {
      write(input);

      return {
        ok: true,
        output: `Saved script "${input.name}".`,
      };
    },
    input: z.object({
      args: ScriptArgs.optional(),
      command: z.string(),
      description: z.string().optional(),
      name: z.string(),
    }),
    name: "write_script",
  });
}
