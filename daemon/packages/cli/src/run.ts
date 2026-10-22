import { spawnSync } from "node:child_process";
import { Effect } from "effect";
import { InstallError } from "./inputs.ts";

export type Ran = { readonly ok: boolean; readonly output: string };

// Runs a system tool to completion. Used for launchctl, systemctl, loginctl and patchelf.
export function run(program: string, args: readonly string[]): Ran {
  const result = spawnSync(program, args, { encoding: "utf8" });

  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

export function must(program: string, args: readonly string[]): Effect.Effect<void, InstallError> {
  const result = run(program, args);

  return result.ok
    ? Effect.void
    : Effect.fail(
        new InstallError({ message: `${program} ${args.join(" ")} failed: ${result.output}` }),
      );
}
