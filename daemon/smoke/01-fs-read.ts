// Slice 1 by hand: a sandboxed daemon under your service manager, reading files through an app.
//
//   bun smoke/01-fs-read.ts                   install, show each request and reply, leave it running
//   bun smoke/01-fs-read.ts --down            stop it and remove everything it installed
//   bun smoke/01-fs-read.ts --loader <ld.so>  NixOS: the glibc loader workerd should use
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { connect } from "@workhorse/conformance/client";
import { ESCAPE_FILE, NOTE, writeFixtures } from "@workhorse/conformance/fixtures";
import { Console, Effect, Schedule } from "effect";
import { oneLiner, runSmoke, show, SmokeFailed } from "./show.ts";

const LABEL = "dev.workhorse.smoke-1";
const BASE = join(tmpdir(), "workhorse-smoke-1");
const DAEMON = join(BASE, "d");
const SOCKET = join(DAEMON, "sock", "daemon.sock");
const CLI = join(import.meta.dirname, "..", "packages", "cli", "src", "main.ts");

const { values } = parseArgs({
  options: { down: { type: "boolean", default: false }, loader: { type: "string" } },
});

function workhorse(...args: string[]): Effect.Effect<void, SmokeFailed> {
  const result = spawnSync(process.execPath, [CLI, ...args], { stdio: "inherit" });

  return result.status === 0
    ? Effect.void
    : Effect.fail(new SmokeFailed({ message: `workhorse ${args[0]} failed` }));
}

const down = Effect.gen(function* () {
  yield* workhorse("uninstall", "--label", LABEL);
  rmSync(BASE, { recursive: true, force: true });
  yield* Console.log(`removed ${BASE}`);
});

// The daemon starts in the background; wait for it, about 6 s at most.
const daemon = Effect.tryPromise({
  try: () => connect(SOCKET, 1000),
  catch: () => new SmokeFailed({ message: `nothing is listening on ${SOCKET}` }),
}).pipe(Effect.retry({ times: 300, schedule: Schedule.spaced("20 millis") }));

const up = Effect.gen(function* () {
  yield* down;
  const fixtures = writeFixtures(join(BASE, "data"));
  const loader = values.loader === undefined ? [] : ["--loader", values.loader];
  yield* workhorse(
    "install",
    "--base",
    DAEMON,
    "--policy",
    fixtures.policy,
    "--app",
    fixtures.app,
    "--label",
    LABEL,
    ...loader,
  );
  yield* Console.log(
    `\npolicy: the notes app may read ${fixtures.notes}; ${join(BASE, "data", "secrets.txt")} is outside it\n`,
  );
  const client = yield* daemon;
  yield* show(client, "hello", { protocol: [1] });
  yield* show(client, "notes.read", { path: NOTE.path });
  yield* show(client, "notes.read", { path: "../secrets.txt" });
  yield* show(client, "notes.read", { path: ESCAPE_FILE });
  yield* show(client, "fs.read", { root: "notes", path: NOTE.path });
  client.close();
  yield* Console.log(`The daemon is still running. Try it yourself:

${oneLiner(SOCKET, "notes.read", { path: NOTE.path })}

or from a file of your own: save this as smoke/try.ts (git ignores it), then run bun smoke/try.ts

  import { connect } from "@workhorse/conformance/client";
  await using daemon = await connect("${SOCKET}");
  await daemon.request("hello", { protocol: [1] });
  console.log(await daemon.request("notes.read", { path: "todo.md" }));

Remove it with: bun smoke/01-fs-read.ts --down`);
});

process.exitCode = await runSmoke(values.down ? down : up);
