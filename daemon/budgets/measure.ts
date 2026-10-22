// Measures the lightness budgets on this machine and fails when one is over its limit.
//   bun budgets/measure.ts [--loader <ld.so>]
// It installs a throwaway daemon (sandboxed, no service manager), starts it several times, and
// reports cold start, idle memory and bundle sizes against budgets/limits.ts.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { connect } from "@workhorse/conformance/client";
import { writeFixtures } from "@workhorse/conformance/fixtures";
import { Console, Effect, Schedule, Schema } from "effect";
import { BUDGETS, type Budget } from "./limits.ts";

class MeasureFailed extends Schema.TaggedError<
  MeasureFailed,
  { readonly MeasureFailed: unique symbol }
>()("MeasureFailed", { message: Schema.String }) {}

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "packages", "cli", "src", "main.ts");
const RUNS = 7;
const platform = process.platform === "darwin" ? "darwin" : "linux";
const { values } = parseArgs({ options: { loader: { type: "string" } } });

type Daemon = {
  readonly base: string;
  readonly command: readonly [string, ...string[]];
  readonly socket: string;
};

const fail = (message: string) => new MeasureFailed({ message });

const install = Effect.fnUntraced(function* (): Effect.fn.Return<Daemon, MeasureFailed> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "workhorse-budgets-")));
  const fixtures = writeFixtures(join(dir, "data"));
  const base = join(dir, "d");
  const loader = values.loader === undefined ? [] : ["--loader", values.loader];

  const args = [
    CLI,
    "install",
    "--base",
    base,
    "--policy",
    fixtures.policy,
    "--app",
    fixtures.app,
    "--service",
    "none",
  ];

  if (spawnSync(process.execPath, [...args, ...loader], { stdio: "inherit" }).status !== 0) {
    return yield* fail("workhorse install failed");
  }

  const command = yield* Effect.mapError(
    Schema.decodeEffect(Schema.fromJsonString(Schema.NonEmptyArray(Schema.String)))(
      readFileSync(join(base, "etc", "command.json"), "utf8"),
    ),
    (error) => fail(error.message),
  );

  return { base, command, socket: join(base, "sock", "daemon.sock") };
});

// One hello, answered. Retried every millisecond for up to 5 s while the daemon starts.
const helloAnswered = (socket: string) => {
  const noAnswer = () => fail(`no answer on ${socket}`);

  const client = Effect.acquireRelease(
    Effect.tryPromise({ try: () => connect(socket, 1000), catch: noAnswer }),
    (open) => Effect.sync(() => open.close()),
  );

  const hello = Effect.flatMap(client, (open) =>
    Effect.tryPromise({ try: () => open.request("hello", { protocol: [1] }), catch: noAnswer }),
  );

  return Effect.scoped(hello).pipe(
    Effect.retry({ times: 5000, schedule: Schedule.spaced("1 millis") }),
  );
};

// Starts the installed command (sandbox included) and returns the time to the first answer.
const coldStart = Effect.fnUntraced(function* (
  daemon: Daemon,
): Effect.fn.Return<{ ms: number; child: ChildProcess }, MeasureFailed> {
  rmSync(daemon.socket, { force: true });
  const [program, ...args] = daemon.command;
  const started = performance.now();
  const child = spawn(program, args, { cwd: join(daemon.base, "etc"), stdio: "ignore" });
  yield* helloAnswered(daemon.socket);

  return { ms: performance.now() - started, child };
});

const stop = (child: ChildProcess) =>
  Effect.callback<void>((resume) => {
    child.once("exit", () => resume(Effect.void));
    child.kill();
  });

// Linux: Private_Clean + Private_Dirty. macOS: phys_footprint, the figure Activity Monitor shows.
function privateMegabytes(workerd: string): number | undefined {
  const pid = spawnSync("pgrep", ["-n", "-f", `^${workerd} serve`], {
    encoding: "utf8",
  }).stdout.trim();

  if (pid === "") return undefined;

  return platform === "linux" ? linuxPrivate(pid) : macFootprint(pid);
}

function linuxPrivate(pid: string): number {
  const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
  const lines = [...rollup.matchAll(/^Private_(?:Clean|Dirty):\s+(\d+) kB$/gm)];

  return lines.reduce((sum, line) => sum + Number(line[1]), 0) / 1024;
}

const MEGABYTES_PER: ReadonlyMap<string, number> = new Map([
  ["KB", 1 / 1024],
  ["MB", 1],
  ["GB", 1024],
]);

function macFootprint(pid: string): number | undefined {
  const footprint = spawnSync("footprint", ["-p", pid], { encoding: "utf8" }).stdout;
  const [, amount, unit] = /phys_footprint:\s+([\d.]+)\s*(KB|MB|GB)/.exec(footprint) ?? [];
  const scale = MEGABYTES_PER.get(unit ?? "");

  return scale === undefined ? undefined : Number(amount) * scale;
}

const gzipKilobytes = (bytes: Uint8Array) => gzipSync(bytes, { level: 9 }).length / 1024;

function coreBundle(): Uint8Array {
  const entry = join(ROOT, "packages", "core", "src", "index.ts");

  return spawnSync(process.execPath, [
    "build",
    entry,
    "--target",
    "browser",
    "--format",
    "esm",
    "--minify",
  ]).stdout;
}

const measure = Effect.fnUntraced(function* (daemon: Daemon) {
  const starts: number[] = [];
  let memory: number | undefined;

  for (let run = 0; run < RUNS; run += 1) {
    const { ms, child } = yield* coldStart(daemon);
    starts.push(ms);

    if (run === RUNS - 1) {
      yield* Effect.sleep("3 seconds");
      memory = privateMegabytes(join(daemon.base, "bin", "workerd"));
    }

    yield* stop(child);
  }

  const median = starts.toSorted((a, b) => a - b)[Math.floor(RUNS / 2)];

  return [
    [BUDGETS.privateMemory, memory],
    [BUDGETS.coldStart, median],
    [BUDGETS.rules, gzipKilobytes(coreBundle())],
    [BUDGETS.daemonBundle, gzipKilobytes(readFileSync(join(daemon.base, "etc", "daemon.js")))],
  ] as const satisfies ReadonlyArray<readonly [Budget, number | undefined]>;
});

type Verdict = { readonly line: string; readonly over: boolean };

function verdict(budget: Budget, value: number | undefined): Verdict {
  if (value === undefined) return { line: `FAIL ${budget.name}: not measured`, over: true };
  const shown = `${budget.name}: ${value.toFixed(1)} ${budget.unit}`;
  const limit = budget.limit[platform];

  if (limit === undefined) return { line: `INFO ${shown} (no limit set yet)`, over: false };
  const over = value > limit;

  return { line: `${over ? "FAIL" : "PASS"} ${shown} (limit ${limit} ${budget.unit})`, over };
}

const program = Effect.gen(function* () {
  const daemon = yield* install();

  const results = yield* Effect.ensuring(
    measure(daemon),
    Effect.sync(() => rmSync(join(daemon.base, ".."), { recursive: true, force: true })),
  );

  const verdicts = results.map(([budget, value]) => verdict(budget, value));
  yield* Console.log(
    `budgets on ${platform} ${process.arch}, ${RUNS} starts:\n${verdicts.map((v) => v.line).join("\n")}`,
  );

  return verdicts.some((v) => v.over) ? 1 : 0;
}).pipe(
  Effect.catchTag("MeasureFailed", (error) =>
    Effect.as(Console.error(`budgets: ${error.message}`), 1),
  ),
);

process.exitCode = await Effect.runPromise(program);
