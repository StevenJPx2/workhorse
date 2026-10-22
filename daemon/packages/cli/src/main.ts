#!/usr/bin/env bun
// workhorse install --base <dir> [--policy <file>] [--app <dir>]... [--sandbox os|none]
//                   [--service os|none] [--label <name>] [--loader <ld.so>]
// workhorse daemon --base <dir>           run the installed daemon in the foreground
// workhorse uninstall [--label <name>]    stop the service and remove its files
// workhorse warm --base <dir>             load the daemon's code now (the service runs this)
import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { Console, Effect, type Option, Schema } from "effect";
import { runDaemon } from "./daemon.ts";
import { InstallError } from "./inputs.ts";
import { install, platformOf } from "./install.ts";
import { layoutOf } from "./layout.ts";
import { serviceFiles, unregister } from "./register.ts";
import { warm } from "./warm.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string" },
    policy: { type: "string" },
    app: { type: "string", multiple: true, default: [] },
    sandbox: { type: "string", default: "os" },
    service: { type: "string", default: "os" },
    label: { type: "string", default: "dev.workhorse.daemon" },
    loader: { type: "string" },
  },
});

// A command-line string is not yet a mode, so it is decoded as unknown input.
const decodeMode = Schema.decodeUnknownOption(Schema.Literals(["os", "none"]));

const decodeLabel = Schema.decodeOption(
  Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,126}$/)),
);

function option<A>(
  decoded: Option.Option<A>,
  name: string,
  value: string,
): Effect.Effect<A, InstallError> {
  return Effect.mapError(
    Effect.fromOption(decoded),
    () => new InstallError({ message: `invalid --${name} ${value}` }),
  );
}

const label = option(decodeLabel(values.label), "label", values.label);

const base = Effect.mapError(
  Effect.fromNullishOr(values.base),
  () => new InstallError({ message: "--base <dir> is required" }),
);

const installCommand = Effect.gen(function* () {
  const installed = yield* install({
    base: yield* base,
    policy: values.policy,
    apps: values.app,
    sandbox: yield* option(decodeMode(values.sandbox), "sandbox", values.sandbox),
    service: yield* option(decodeMode(values.service), "service", values.service),
    label: yield* label,
    loader: values.loader,
  });

  const how = installed.service
    ? `running under the service manager as ${values.label}`
    : "run it with: workhorse daemon";

  yield* Console.log(
    `installed ${installed.layout.base}\nsocket: ${installed.layout.socket}\n${how}`,
  );

  return 0;
});

const daemonCommand = Effect.flatMap(base, (dir) => runDaemon(layoutOf(realpathSync(dir))));

const warmCommand = Effect.as(
  Effect.flatMap(base, (dir) => warm(layoutOf(realpathSync(dir)).socket)),
  0,
);

const uninstallCommand = Effect.gen(function* () {
  const platform = yield* platformOf(process.platform);
  const name = yield* label;
  // Service file paths depend only on the home folder and the label.
  yield* unregister(platform, name, serviceFiles(platform, name, layoutOf("/"), []));
  yield* Console.log(`removed the ${name} service`);

  return 0;
});

const COMMANDS: ReadonlyMap<string, Effect.Effect<number, InstallError>> = new Map([
  ["install", installCommand],
  ["daemon", daemonCommand],
  ["uninstall", uninstallCommand],
  ["warm", warmCommand],
]);

const command =
  COMMANDS.get(positionals[0] ?? "") ??
  Effect.fail(
    new InstallError({
      message: `unknown command ${String(positionals[0])}; use ${[...COMMANDS.keys()].join(", ")}`,
    }),
  );

const program = Effect.catchTag(command, "InstallError", (error) =>
  Effect.as(Console.error(`workhorse: ${error.message}`), 1),
);

process.exitCode = await Effect.runPromise(program);
