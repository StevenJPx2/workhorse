// Two daemons paired by hand, the way `workhorse pair` writes their policies. "home" serves the
// notes app and accepts links; "laptop" serves the journal app and dials home. Each routes the
// other's app over the link and lets the other read only its own app. The real CLI installs both,
// as a separate process, so this depends on the protocol only.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Certificate, type Json, PublicKey } from "@workhorse/protocol";
import { Effect, Schema } from "effect";
import { writeFixtures } from "./fixtures.ts";

export const ENTRY = { path: "today.md", text: "walked the dog\n" } as const;

const JOURNAL_APP = join(import.meta.dirname, "..", "fixtures", "journal");

export class PairFailed extends Schema.TaggedError<
  PairFailed,
  { readonly PairFailed: unique symbol }
>()("PairFailed", { message: Schema.String }) {}

export type Side = "home" | "laptop";

/** One installed daemon of the pair. */
export type LinkedDaemon = { readonly base: string; readonly socket: string };

export type LinkedPair = {
  readonly home: LinkedDaemon;
  readonly laptop: LinkedDaemon;
  /** Where home accepts links. */
  readonly listen: string;
};

/** The CLI to run, the port home listens on, and what each side's install adds, such as `--service none`. */
export type PairOptions = {
  readonly cli: string;
  readonly port: number;
  readonly install: (side: Side) => readonly string[];
};

const decodeKey = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ key: PublicKey, certificate: Certificate })),
);

const daemonAt = (base: string): LinkedDaemon => ({
  base,
  socket: join(base, "sock", "daemon.sock"),
});

// Runs when the effect runs, not when it is built, so an install can be defined once and repeated.
function workhorse(cli: string, args: readonly string[]): Effect.Effect<string, PairFailed> {
  return Effect.suspend(() => {
    const result = spawnSync("bun", [cli, ...args], { encoding: "utf8" });

    return result.status === 0
      ? Effect.succeed(result.stdout)
      : Effect.fail(new PairFailed({ message: `workhorse ${args.join(" ")}: ${result.stderr}` }));
  });
}

// A daemon's key and certificate, as `workhorse key` prints them for a peer's policy.
const keyOf = (cli: string, daemon: LinkedDaemon) =>
  workhorse(cli, ["key", "--base", daemon.base]).pipe(
    Effect.flatMap(decodeKey),
    Effect.mapError((error) => new PairFailed({ message: `${daemon.base}: ${error.message}` })),
  );

const writePolicy = (file: string, policy: Json) =>
  Effect.sync(() => writeFileSync(file, JSON.stringify(policy, null, 2)));

/** Install the pair in `dir`, paired and routed both ways; neither daemon is started. */
export const installLinkedPair = Effect.fnUntraced(function* (
  dir: string,
  options: PairOptions,
): Effect.fn.Return<LinkedPair, PairFailed> {
  const home = daemonAt(join(dir, "home"));
  const laptop = daemonAt(join(dir, "laptop"));
  const listen = `127.0.0.1:${options.port}`;
  const notes = writeFixtures(join(dir, "home-data"));
  const journal = join(dir, "laptop-data", "journal");
  const laptopPolicy = join(dir, "laptop-data", "policy.json");
  const homeArgs = ["install", "--base", home.base, "--policy", notes.policy, "--app", notes.app];

  const laptopArgs = [
    "install",
    "--base",
    laptop.base,
    "--policy",
    laptopPolicy,
    "--app",
    JOURNAL_APP,
  ];

  yield* Effect.sync(() => {
    mkdirSync(journal, { recursive: true });
    writeFileSync(join(journal, ENTRY.path), ENTRY.text);
  });

  const journalGrant = { journal: { fs: { roots: { journal }, mode: "read" } } };
  const notesGrant = { notes: { fs: { roots: { notes: notes.notes }, mode: "read" } } };

  const installBoth = Effect.andThen(
    workhorse(options.cli, [...homeArgs, "--listen", listen, ...options.install("home")]),
    workhorse(options.cli, [...laptopArgs, ...options.install("laptop")]),
  );

  // Installed alone first, each daemon makes its key and certificate.
  yield* writePolicy(laptopPolicy, { apps: journalGrant });
  yield* installBoth;
  const homeKey = yield* keyOf(options.cli, home);
  const laptopKey = yield* keyOf(options.cli, laptop);

  yield* writePolicy(notes.policy, {
    apps: notesGrant,
    peers: { laptop: { ...laptopKey, operations: ["notes.read"] } },
    routes: { journal: "laptop" },
  });
  yield* writePolicy(laptopPolicy, {
    apps: journalGrant,
    peers: { home: { ...homeKey, address: listen, operations: ["journal.read"] } },
    routes: { notes: "home" },
  });
  yield* installBoth;

  return { home, laptop, listen };
});
