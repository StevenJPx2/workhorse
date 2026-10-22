#!/usr/bin/env bun
// workhorse install --base <dir> [--policy <file>] [--app <dir>]...
// workhorse daemon --base <dir>
import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { Console, Effect } from "effect";
import { runDaemon } from "./daemon.ts";
import { InstallError } from "./inputs.ts";
import { install } from "./install.ts";
import { layoutOf } from "./layout.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string" },
    policy: { type: "string" },
    app: { type: "string", multiple: true, default: [] },
  },
});

const command = positionals[0];

const program = Effect.gen(function* () {
  if (values.base === undefined)
    return yield* new InstallError({ message: "--base <dir> is required" });

  if (command === "install") {
    const layout = yield* install({ base: values.base, policy: values.policy, apps: values.app });
    yield* Console.log(`installed ${layout.base}\nsocket: ${layout.socket}`);

    return 0;
  }

  if (command === "daemon") return yield* runDaemon(layoutOf(realpathSync(values.base)));

  return yield* new InstallError({
    message: `unknown command ${String(command)}; use install or daemon`,
  });
}).pipe(
  Effect.catchTag("InstallError", (error) =>
    Effect.as(Console.error(`workhorse: ${error.message}`), 1),
  ),
);

process.exitCode = await Effect.runPromise(program);
