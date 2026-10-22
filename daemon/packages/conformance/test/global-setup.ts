// Vitest global setup for the conformance suite. Unless WORKHORSE_SOCKET already names a daemon,
// it installs a throwaway one with the real CLI and the suite's fixtures, runs it, and
// removes it afterwards. Setting WORKHORSE_SOCKET for the test workers is its only env access.
// @effect-diagnostics processEnv:off
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schedule, Schema } from "effect";
import { connect } from "../src/client.ts";
import { writeFixtures } from "../src/fixtures.ts";

class DaemonDidNotStart extends Schema.TaggedError<
  DaemonDidNotStart,
  { readonly DaemonDidNotStart: unique symbol }
>()("DaemonDidNotStart", {
  reason: Schema.String,
}) {}

// Run as a separate process: the suite depends on the protocol only, not on the CLI's code.
const cli = join(import.meta.dirname, "..", "..", "cli", "src", "main.ts");

// Polls every 10 ms for at most 500 attempts (about 5 s).
const waitUntilListening = (socket: string) =>
  Effect.tryPromise({
    try: () => connect(socket, 1000),
    catch: () => new DaemonDidNotStart({ reason: `nothing listening on ${socket}` }),
  }).pipe(
    Effect.flatMap((client) => Effect.sync(() => client.close())),
    Effect.retry({ times: 500, schedule: Schedule.spaced("10 millis") }),
  );

function install(base: string): Effect.Effect<void, DaemonDidNotStart> {
  const fixtures = writeFixtures(join(base, "data"));
  // Sandboxed (the default) but not registered with the service manager: the suite runs the
  // installed command itself, so no launchd or systemd state outlives a test run.
  const args = [cli, "install", "--base", base, "--policy", fixtures.policy, "--app", fixtures.app];
  const result = spawnSync("bun", [...args, "--service", "none"], { stdio: "inherit" });

  return result.status === 0
    ? Effect.void
    : Effect.fail(
        new DaemonDidNotStart({ reason: `workhorse install exited with ${String(result.status)}` }),
      );
}

export default function setup(): Promise<() => void> {
  if (process.env["WORKHORSE_SOCKET"] !== undefined) return Promise.resolve(() => undefined);
  const base = mkdtempSync(join(tmpdir(), "workhorse-conformance-"));
  const socket = join(base, "sock", "daemon.sock");
  let daemon: ChildProcess | undefined;

  // Reads `daemon` when called, so teardown stops whatever process was started.
  const stop = () => {
    daemon?.kill();
    rmSync(base, { recursive: true, force: true });
  };

  const program = install(base).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        daemon = spawn("bun", [cli, "daemon", "--base", base], { stdio: "inherit" });
      }),
    ),
    Effect.flatMap(() => waitUntilListening(socket)),
    Effect.tapError(() => Effect.sync(stop)),
  );

  // Test workers are started after this resolves, so they inherit the variable.
  return Effect.runPromise(program).then(() => {
    process.env["WORKHORSE_SOCKET"] = socket;

    return stop;
  });
}
