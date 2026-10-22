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
import { type Client, connect } from "@workhorse/conformance/client";
import { ESCAPE_FILE, NOTE, writeFixtures } from "@workhorse/conformance/fixtures";
import type { Json } from "@workhorse/protocol";
import { Console, Effect, Schedule, Schema } from "effect";

class SmokeFailed extends Schema.TaggedError<
  SmokeFailed,
  { readonly SmokeFailed: unique symbol }
>()("SmokeFailed", {
  message: Schema.String,
}) {}

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

function show(client: Client, method: string, params: Json): Effect.Effect<void, SmokeFailed> {
  return Effect.tryPromise({
    try: () => client.request(method, params),
    catch: (cause) => new SmokeFailed({ message: String(cause) }),
  }).pipe(
    Effect.flatMap((response) =>
      Console.log(
        `→ ${JSON.stringify({ jsonrpc: "2.0", id: response.id, method, params })}\n← ${JSON.stringify(response)}\n`,
      ),
    ),
  );
}

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

  printf '%s\\n' '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"protocol":[1]}}' \\
    '{"jsonrpc":"2.0","id":2,"method":"notes.read","params":{"path":"todo.md"}}' | nc -U -w 1 ${SOCKET}

or from a file of your own: save this as smoke/try.ts (git ignores it), then run bun smoke/try.ts

  import { connect } from "@workhorse/conformance/client";
  await using daemon = await connect("${SOCKET}");
  await daemon.request("hello", { protocol: [1] });
  console.log(await daemon.request("notes.read", { path: "todo.md" }));

Remove it with: bun smoke/01-fs-read.ts --down`);
});

const program = (values.down ? down : up).pipe(
  Effect.as(0),
  Effect.catchTag("SmokeFailed", (error) => Effect.as(Console.error(`smoke: ${error.message}`), 1)),
);

process.exitCode = await Effect.runPromise(program);
