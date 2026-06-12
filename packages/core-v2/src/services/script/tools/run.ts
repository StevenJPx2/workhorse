import z from "zod";

import {
  defineTool,
  renderHelp,
  resolveInvocation,
  type ScriptT,
} from "#schema";

export function runScriptTool(scripts: () => readonly ScriptT[]) {
  return defineTool({
    annotations: {
      destructive_hint: true,
      idempotent_hint: false,
      open_world_hint: true,
      read_only_hint: false,
      title: "Run script",
    },
    description:
      "Run a named script with optional positional args and named options, returning " +
      "its output. Call with no name to list the available scripts; pass `help: true` " +
      "to show a script's usage (its positional args and named options) instead of running it.",
    execute: async ({ help, name, options, positional }, ctx) => {
      if (!name) {
        return {
          ok: true,
          output:
            scripts()
              .map((script) => `- **${script.name}**: ${script.description}`)
              .join("\n") || "No scripts are available.",
        };
      }

      const script = scripts().find((candidate) => candidate.name === name);

      if (!script) {
        return {
          error: `No script named "${name}".`,
          ok: false,
        };
      }

      if (help) {
        return { ok: true, output: renderHelp(script) };
      }

      return script.run(
        resolveInvocation(script, { options, positional }),
        ctx,
      );
    },
    input: z.object({
      help: z.boolean().optional(),
      name: z.string().optional(),
      options: z.record(z.string(), z.string()).optional(),
      positional: z.array(z.string()).optional(),
    }),
    name: "run_script",
  });
}
