// Slice 2 by hand: two sandboxed daemons under your service manager, linked over TLS, calling
// each other's apps. "laptop" dials "home" on 127.0.0.1; any address works the same way.
//
//   bun smoke/02-home-link.ts                   install both, show calls each way, leave them running
//   bun smoke/02-home-link.ts --down            stop both and remove everything they installed
//   bun smoke/02-home-link.ts --loader <ld.so>  NixOS: the glibc loader workerd should use
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type Client, connect } from "@workhorse/conformance/client";
import { NOTE } from "@workhorse/conformance/fixtures";
import { ENTRY, installLinkedPair, type Side } from "@workhorse/conformance/linked-pair";
import { Console, Effect, Schedule } from "effect";
import { oneLiner, runSmoke, show, SmokeFailed } from "./show.ts";

const label = (side: Side) => `dev.workhorse.smoke-2-${side}`;
const BASE = join(tmpdir(), "workhorse-smoke-2");
const PORT = 47802;
const CLI = join(import.meta.dirname, "..", "packages", "cli", "src", "main.ts");

const { values } = parseArgs({
  options: { down: { type: "boolean", default: false }, loader: { type: "string" } },
});

const down = Effect.gen(function* () {
  for (const side of ["home", "laptop"] as const)
    spawnSync(process.execPath, [CLI, "uninstall", "--label", label(side)], { stdio: "inherit" });
  rmSync(BASE, { recursive: true, force: true });
  yield* Console.log(`removed ${BASE}`);
});

// The daemons start in the background; wait for each, about 6 s at most.
const daemon = (socket: string) =>
  Effect.tryPromise({
    try: () => connect(socket, 15_000),
    catch: () => new SmokeFailed({ message: `nothing is listening on ${socket}` }),
  }).pipe(Effect.retry({ times: 300, schedule: Schedule.spaced("20 millis") }));

// The laptop dials home after it starts; wait until a routed call is answered.
const linked = (client: Client) =>
  Effect.tryPromise({
    try: () => client.request("notes.read", { path: NOTE.path }),
    catch: (cause) => new SmokeFailed({ message: String(cause) }),
  }).pipe(
    Effect.repeat({
      until: (response) => "result" in response,
      schedule: Schedule.spaced("100 millis"),
      times: 100,
    }),
  );

const up = Effect.gen(function* () {
  yield* down;
  const loader = values.loader === undefined ? [] : ["--loader", values.loader];

  const pair = yield* installLinkedPair(BASE, {
    cli: CLI,
    port: PORT,
    install: (side) => ["--label", label(side), ...loader],
  }).pipe(Effect.mapError((error) => new SmokeFailed({ message: error.message })));

  yield* Console.log(`
home accepts links on ${pair.listen} and serves notes; the laptop dials it and serves journal.
Each routes the other's app over the link, and lets the other call only its own app's read.
`);
  const laptop = yield* daemon(pair.laptop.socket);
  const home = yield* daemon(pair.home.socket);

  yield* show(laptop, "hello", { protocol: [1] }, "laptop");
  yield* show(home, "hello", { protocol: [1] }, "home");
  yield* linked(laptop);
  yield* show(laptop, "notes.read", { path: NOTE.path }, "laptop");
  yield* show(laptop, "notes.read", { path: "../secrets.txt" }, "laptop");
  yield* show(laptop, "notes.write", { path: NOTE.path }, "laptop");
  yield* show(home, "journal.read", { path: ENTRY.path }, "home");
  laptop.close();
  home.close();
  yield* Console.log(`Both daemons are still running. Try it yourself:

${oneLiner(pair.laptop.socket, "notes.read", { path: NOTE.path })}

Stop home (launchctl bootout gui/$(id -u)/${label("home")}, or systemctl --user stop ${label("home")}.service)
and the same call answers unavailable at once; start it again and the link comes back.

Each daemon logs link open and link ended to ${join(pair.laptop.base, "log")} and ${join(pair.home.base, "log")} (macOS).
Remove both with: bun smoke/02-home-link.ts --down`);
});

process.exitCode = await runSmoke(values.down ? down : up);
