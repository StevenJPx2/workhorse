// A linked pair for the link tests: installed with the real CLI (sandboxed, no service manager),
// started and stopped by the tests themselves so they can kill, freeze and restart either side.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Json, Response } from "@workhorse/protocol";
import { Effect, Option, Schedule, Schema } from "effect";
import { type Client, connect } from "../src/client.ts";
import {
  installLinkedPair,
  type LinkedDaemon,
  type LinkedPair,
  type Side,
} from "../src/linked-pair.ts";

class LinkTestFailed extends Schema.TaggedError<
  LinkTestFailed,
  { readonly LinkTestFailed: unique symbol }
>()("LinkTestFailed", { message: Schema.String }) {}

const cli = join(import.meta.dirname, "..", "..", "cli", "src", "main.ts");

const decodeCommand = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
);

const decodePort = Schema.decodeUnknownOption(Schema.Struct({ port: Schema.Int }));

// A port nothing listens on now; the pair's home binds it a moment later.
const freePort = Effect.callback<number>((resume) => {
  const server = createServer();

  server.listen(0, "127.0.0.1", () => {
    const port = Option.match(decodePort(server.address()), {
      onNone: () => 0,
      onSome: (address) => address.port,
    });

    server.close(() => resume(Effect.succeed(port)));
  });
});

/** The running pair, and control over each side's daemon process. */
export type Running = {
  readonly pair: LinkedPair;
  readonly start: (side: Side) => Effect.Effect<void, LinkTestFailed>;
  readonly kill: (side: Side) => void;
  readonly signal: (side: Side, signal: "SIGSTOP" | "SIGCONT") => void;
  readonly client: (side: Side) => Effect.Effect<Client, LinkTestFailed>;
  readonly remove: () => void;
};

/** Install and start a linked pair in a fresh folder. */
export const runLinkedPair = Effect.gen(function* () {
  const dir = mkdtempSync(join(tmpdir(), "workhorse-link-"));
  const port = yield* freePort;

  const pair = yield* installLinkedPair(dir, {
    cli,
    port,
    install: () => ["--service", "none"],
  }).pipe(Effect.mapError((error) => new LinkTestFailed({ message: error.message })));

  const processes = new Map<Side, ChildProcess>();
  const daemonOf = (side: Side): LinkedDaemon => pair[side];

  const client = (side: Side) =>
    Effect.tryPromise({
      try: () => connect(daemonOf(side).socket, 15_000),
      catch: () => new LinkTestFailed({ message: `nothing listening for ${side}` }),
    }).pipe(Effect.retry({ times: 300, schedule: Schedule.spaced("20 millis") }));

  // The installed command, sandbox included, as the service manager would run it.
  const start = (side: Side) =>
    Effect.gen(function* () {
      const { base, socket } = daemonOf(side);

      const [program, ...args] = decodeCommand(
        readFileSync(join(base, "etc", "command.json"), "utf8"),
      );

      rmSync(socket, { force: true });
      processes.set(side, spawn(program, args, { cwd: join(base, "etc"), stdio: "inherit" }));
      // The first connection loads the daemon and starts its links, as `workhorse warm` does.
      const first = yield* client(side);

      yield* Effect.promise(() => first.request("hello", { protocol: [1] }));
      first.close();
    });

  const kill = (side: Side) => processes.get(side)?.kill("SIGKILL");

  // The workerd process itself: under bubblewrap it is a child of the sandbox, so the newest match.
  const signal = (side: Side, name: "SIGSTOP" | "SIGCONT") => {
    const pattern = `${join(daemonOf(side).base, "bin", "workerd")} serve`;
    const pid = spawnSync("pgrep", ["-n", "-f", pattern], { encoding: "utf8" }).stdout.trim();

    if (pid !== "") process.kill(Number(pid), name);
  };

  const remove = () => {
    for (const child of processes.values()) child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  };

  yield* start("home");
  yield* start("laptop");

  return { pair, start, kill, signal, client, remove } satisfies Running;
});

/**
 * The HTTP status of a link upgrade to home claiming `key`, over TLS pinned to home's certificate:
 * 101 if home accepts it. 0 if the connection itself fails.
 */
export function upgradeStatus(running: Running, key: string): Effect.Effect<number> {
  const [host = "", port = ""] = running.pair.listen.split(":");
  const pinned = readFileSync(join(running.pair.home.base, "etc", "tls-certificate.pem"), "utf8");

  return Effect.callback<number>((resume) => {
    const upgrade = httpsRequest({
      host,
      port: Number(port),
      path: "/link",
      ca: pinned,
      servername: "daemon.workhorse",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "workhorse-key": key,
      },
    });

    upgrade.on("response", (response) => resume(Effect.succeed(response.statusCode ?? 0)));
    upgrade.on("upgrade", () => resume(Effect.succeed(101)));
    upgrade.on("error", () => resume(Effect.succeed(0)));
    upgrade.end();

    return Effect.sync(() => upgrade.destroy());
  });
}

/** One request; a daemon that does not answer fails the test. */
export function call(client: Client, method: string, params: Json): Effect.Effect<Response> {
  return Effect.promise(() => client.request(method, params));
}

/** Call until the answer is a result, every 100 ms for at most `seconds`; the last response otherwise. */
export function untilAnswered(
  client: Client,
  method: string,
  params: Json,
  seconds: number,
): Effect.Effect<Response> {
  return call(client, method, params).pipe(
    Effect.repeat({
      until: (response) => "result" in response,
      schedule: Schedule.spaced("100 millis"),
      times: seconds * 10,
    }),
  );
}
