// The accepting daemon is warmed with its app before the link opens, so this measures the link
// rather than first-load app memory. Sandboxed on both sides, just like the conformance pair.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { connect, type Client } from "@workhorse/conformance/client";
import { installLinkedPair, type LinkedDaemon } from "@workhorse/conformance/linked-pair";
import { Console, Effect, Schedule, Schema } from "effect";
import { BUDGETS } from "./limits.ts";
import { privateMegabytes } from "./memory/index.ts";

class LinkBudgetFailed extends Schema.TaggedError<
  LinkBudgetFailed,
  { readonly LinkBudgetFailed: unique symbol }
>()("LinkBudgetFailed", {
  message: Schema.String,
}) {}

const commandOf = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)),
);

const CLI = join(import.meta.dirname, "..", "packages", "cli", "src", "main.ts");
const { values } = parseArgs({ options: { loader: { type: "string" } } });
const loader = values.loader === undefined ? [] : ["--loader", values.loader];
const platform = process.platform === "darwin" ? "darwin" : "linux";

/** Own the daemon process for the measurement and kill it before deleting its installation. */
function start(daemon: LinkedDaemon) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const [program, ...args] = commandOf(
        readFileSync(join(daemon.base, "etc", "command.json"), "utf8"),
      );

      return spawn(program, args, { cwd: join(daemon.base, "etc"), stdio: "ignore" });
    }),
    (child) =>
      Effect.callback<void>((resume) => {
        if (child.exitCode !== null || child.signalCode !== null) resume(Effect.void);
        else {
          child.once("exit", () => resume(Effect.void));
          child.kill("SIGKILL");
        }
      }),
  );
}

/** A ready local client, closed at the end of the measurement. */
function clientAt(socket: string) {
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: () => connect(socket),
      catch: () => new LinkBudgetFailed({ message: `not listening: ${socket}` }),
    }).pipe(Effect.retry({ times: 200, schedule: Schedule.spaced("25 millis") })),
    (client) => Effect.sync(() => client.close()),
  ).pipe(Effect.tap((client) => Effect.promise(() => client.request("hello", { protocol: [1] }))));
}

/** Confirm an actual remote app reply; a disconnected or unauthenticated link cannot pass. */
function answered(client: Client) {
  return Effect.promise(() => client.request("notes.read", { path: "todo.md" })).pipe(
    Effect.flatMap((response) =>
      "result" in response
        ? Effect.void
        : Effect.fail(new LinkBudgetFailed({ message: "link did not answer" })),
    ),
    Effect.retry({ times: 100, schedule: Schedule.spaced("50 millis") }),
  );
}

const program = Effect.scoped(
  Effect.gen(function* () {
    const folder = yield* Effect.acquireRelease(
      Effect.sync(() => realpathSync(mkdtempSync(join(tmpdir(), "wh-lb-")))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    );

    const pair = yield* installLinkedPair(folder, {
      cli: CLI,
      port: 47803,
      install: () => ["--service", "none", ...loader],
    });

    yield* start(pair.home);
    const home = yield* clientAt(pair.home.socket);
    yield* answered(home);
    yield* Effect.sleep("3 seconds");
    const binary = join(pair.home.base, "bin", "workerd");
    const before = privateMegabytes(binary);

    yield* start(pair.laptop);
    const laptop = yield* clientAt(pair.laptop.socket);
    yield* answered(laptop);
    yield* Effect.sleep("3 seconds");
    const after = privateMegabytes(binary);

    return yield* reportLinkMemory(before, after);
  }),
).pipe(
  Effect.catchTags({
    LinkBudgetFailed: (error) => Effect.as(Console.error(`FAIL link memory: ${error.message}`), 1),
    PairFailed: (error) => Effect.as(Console.error(`FAIL link installation: ${error.message}`), 1),
  }),
);

/** Report missing readings as a failure; compare the actual delta without rounding it for the gate. */
function reportLinkMemory(before: number | undefined, after: number | undefined) {
  if (before === undefined || after === undefined)
    return Effect.fail(new LinkBudgetFailed({ message: "could not measure link memory" }));
  const extra = Math.max(0, after - before);
  const budget = BUDGETS.linkMemory;
  const over = extra > budget.limit[platform];
  const status = over ? "FAIL" : "PASS";

  return Effect.as(
    Console.log(
      `${status} ${budget.name}: ${extra.toFixed(2)} MB (limit ${budget.limit[platform]} MB); ${before.toFixed(2)} → ${after.toFixed(2)} MB`,
    ),
    Number(over),
  );
}

process.exitCode = await Effect.runPromise(program);
