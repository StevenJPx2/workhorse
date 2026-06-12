import { Bash, ReadWriteFs } from "just-bash";

import { Script, type ScriptArgsT, type ScriptT } from "#schema";

export function defineScript(
  spec: Omit<ScriptT, "args" | "run"> & { args?: ScriptArgsT },
): ScriptT {
  return Script.parse({
    ...spec,

    run: async ({ options, positional }, ctx) => {
      const env: Record<string, string> = {};

      for (const [key, value] of Object.entries(options)) {
        env[key.toUpperCase().replaceAll("-", "_")] = value;
      }

      const { exitCode, stderr, stdout } = await new Bash({
        cwd: "/",
        fs: new ReadWriteFs({ root: ctx.cwd }),
      }).exec(
        `set -- ${positional
          .map((value) => `'${value.replaceAll("'", String.raw`'\''`)}'`)
          .join(" ")}\n${spec.command}`,
        { env },
      );

      if (exitCode === 0) {
        return { ok: true, output: stdout };
      }

      return {
        error: stderr || `Script exited with code ${exitCode}.`,
        ok: false,
        output: stdout,
      };
    },
  } as ScriptT);
}
