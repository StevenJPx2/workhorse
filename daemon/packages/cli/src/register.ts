import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Console, Effect, Schedule } from "effect";
import { InstallError } from "./inputs.ts";
import type { Layout } from "./layout.ts";
import { must, run } from "./run.ts";
import { launchdAgent, type ServiceFile, systemdUnits, type Warm } from "./service.ts";

export type Platform = "darwin" | "linux";

const uid = () => String(process.getuid?.() ?? 0);

export function serviceFiles(
  platform: Platform,
  label: string,
  layout: Layout,
  command: readonly string[],
): readonly ServiceFile[] {
  // `workhorse warm` with the runtime and CLI that installed the service. A release ships a
  // standalone CLI; until then the service refers to this checkout.
  const warm: Warm = {
    runtime: process.execPath,
    cli: join(import.meta.dirname, "main.ts"),
    base: layout.base,
  };

  return platform === "darwin"
    ? [launchdAgent(homedir(), label, layout, command, warm)]
    : systemdUnits(homedir(), label, layout, command, warm);
}

// Writes the service files and starts the daemon under the service manager, replacing any
// earlier registration with the same label.
export const register = Effect.fnUntraced(function* (
  platform: Platform,
  label: string,
  files: readonly ServiceFile[],
): Effect.fn.Return<void, InstallError> {
  yield* unregister(platform, label, []);
  yield* Effect.try({
    try: () => {
      for (const file of files) {
        mkdirSync(dirname(file.path), { recursive: true });
        writeFileSync(file.path, file.content);
      }
    },
    catch: (cause) => new InstallError({ message: `cannot write service files: ${String(cause)}` }),
  });

  if (platform === "darwin") {
    for (const file of files) yield* must("launchctl", ["bootstrap", `gui/${uid()}`, file.path]);

    return;
  }

  yield* must("systemctl", ["--user", "daemon-reload"]);
  // The socket first, so the service receives it when it starts now and at every login.
  yield* must("systemctl", ["--user", "enable", "--now", `${label}.socket`]);
  yield* must("systemctl", ["--user", "enable", "--now", `${label}.service`]);
  yield* warnWithoutLinger();
});

// Stops the daemon and removes its service files. A missing registration is not an error.
export const unregister = Effect.fnUntraced(function* (
  platform: Platform,
  label: string,
  files: readonly ServiceFile[],
): Effect.fn.Return<void, InstallError> {
  stopService(platform, label);

  for (const file of files) rmSync(file.path, { force: true });

  if (platform === "linux") yield* must("systemctl", ["--user", "daemon-reload"]);

  if (platform === "darwin") yield* untilUnloaded(label);
});

// `launchctl bootout` returns before the agent is gone, and bootstrapping the same label until
// then fails ("Bootstrap failed: 5"). Waits for launchd to forget it: every 100 ms, at most 10 s.
function untilUnloaded(label: string): Effect.Effect<void, InstallError> {
  const gone = Effect.suspend(() =>
    run("launchctl", ["print", `gui/${uid()}/${label}`]).ok
      ? Effect.fail(new InstallError({ message: `launchd still has ${label} after 10 s` }))
      : Effect.void,
  );

  return Effect.retry(gone, { times: 100, schedule: Schedule.spaced("100 millis") });
}

// Best effort: the service may not be registered at all.
function stopService(platform: Platform, label: string): void {
  if (platform === "darwin") {
    run("launchctl", ["bootout", `gui/${uid()}/${label}`]);

    return;
  }

  run("systemctl", ["--user", "disable", "--now", `${label}.socket`, `${label}.service`]);
  // A crash loop leaves the units failed with their start limit hit, which blocks a reinstall.
  run("systemctl", ["--user", "reset-failed", `${label}.socket`, `${label}.service`]);
}

// Without lingering, systemd stops user services at logout; a home server needs it on.
function warnWithoutLinger(): Effect.Effect<void> {
  const linger = run("loginctl", ["show-user", uid(), "--property=Linger", "--value"]);

  return linger.ok && linger.output === "no"
    ? Console.error(
        "warning: lingering is off, so the daemon stops when you log out. Enable it: loginctl enable-linger",
      )
    : Effect.void;
}
