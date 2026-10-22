import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { Effect, Schema } from "effect";
import { InstallError } from "./inputs.ts";
import type { Layout } from "./layout.ts";

const decodeCommand = Schema.decodeEffect(
  Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
);

// Runs the installed command (sandbox included) in the foreground until it exits, passing stop
// signals on. The service manager runs the same command.
export const runDaemon = Effect.fnUntraced(function* (
  layout: Layout,
): Effect.fn.Return<number, InstallError> {
  const text = yield* Effect.try({
    try: () => readFileSync(layout.command, "utf8"),
    catch: () =>
      new InstallError({ message: `${layout.base} is not installed; run workhorse install first` }),
  });

  const [program, ...args] = yield* Effect.mapError(
    decodeCommand(text),
    (error) => new InstallError({ message: `invalid ${layout.command}: ${error.message}` }),
  );

  return yield* Effect.callback<number>((resume) => {
    // workerd does not remove a stale socket file, so a crashed daemon could never bind again.
    // One daemon owns this base folder, so the file cannot belong to a live one.
    rmSync(layout.socket, { force: true });
    // workerd opens its working directory at startup; the config folder is inside the grants.
    const child = spawn(program, args, { cwd: layout.etc, stdio: "inherit" });
    const stop = (signal: NodeJS.Signals) => child.kill(signal);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resume(Effect.succeed(code ?? (signal === null ? 1 : 128)));
    });
  });
});
