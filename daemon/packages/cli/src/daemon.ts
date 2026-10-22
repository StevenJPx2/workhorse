import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { Effect } from "effect";
import type { Layout } from "./layout.ts";

// Runs the daemon in the foreground until it exits, passing stop signals on.
export function runDaemon(layout: Layout): Effect.Effect<number> {
  return Effect.callback<number>((resume) => {
    // workerd does not remove a stale socket file, so a crashed daemon could never bind again.
    // One daemon owns this base folder, so the file cannot belong to a live one.
    rmSync(layout.socket, { force: true });

    // workerd opens its working directory at startup; the config folder is inside the grants.
    const child = spawn(layout.workerd, ["serve", layout.config, "--experimental"], {
      cwd: layout.etc,
      stdio: "inherit",
    });

    const stop = (signal: NodeJS.Signals) => child.kill(signal);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resume(Effect.succeed(code ?? (signal === null ? 1 : 128)));
    });
  });
}
