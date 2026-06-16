import { defineTool, WriteScriptInput, type WriteScriptInputT } from "#schema";

export type WriteScript = (input: WriteScriptInputT) => void;

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
    input: WriteScriptInput,
    name: "write_script",
  });
}
