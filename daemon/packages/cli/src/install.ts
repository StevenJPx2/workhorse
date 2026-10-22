import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { AppSpec, Deployment, Policy } from "@workhorse/protocol";
import { Effect } from "effect";
import { diskRoots, renderConfig } from "./config.ts";
import { InstallError, readApp, readPolicy } from "./inputs.ts";
import { type Layout, layoutOf, MAX_SOCKET_PATH } from "./layout.ts";

export type InstallOptions = {
  readonly base: string;
  readonly policy: string | undefined;
  readonly apps: readonly string[];
};

// Development builds bundle the worker from this workspace; a release ships the bundle.
const WORKER_ENTRY = join(import.meta.dirname, "..", "..", "worker", "src", "index.ts");

export const install = Effect.fnUntraced(function* (
  options: InstallOptions,
): Effect.fn.Return<Layout, InstallError> {
  const layout = yield* prepare(options.base);

  const policy: Policy =
    options.policy === undefined ? { apps: {} } : yield* readPolicy(options.policy);

  const apps = yield* Effect.forEach(options.apps, readApp);
  yield* checkApps(policy, apps);
  const deployment: Deployment = { policy, apps };
  yield* attempt("copy the workerd binary", () => copyFileSync(workerdBinary(), layout.workerd));
  yield* bundleWorker(layout.bundle);
  yield* attempt("write the configuration", () => {
    writeFileSync(layout.deployment, JSON.stringify(deployment));
    writeFileSync(layout.config, renderConfig(layout, diskRoots(policy)));
  });

  return layout;
});

const prepare = Effect.fnUntraced(function* (base: string): Effect.fn.Return<Layout, InstallError> {
  yield* attempt(`create ${base}`, () => mkdirSync(base, { recursive: true }));
  const layout = layoutOf(realpathSync(base));

  if (Buffer.byteLength(layout.socket) > MAX_SOCKET_PATH) {
    return yield* new InstallError({
      message: `socket path ${layout.socket} is longer than ${MAX_SOCKET_PATH} bytes`,
    });
  }

  yield* attempt("create the daemon's folders", () => {
    for (const dir of [layout.bin, layout.etc, layout.state, layout.sock, layout.log])
      mkdirSync(dir, { recursive: true });
  });

  return layout;
});

// A grant for an app that is not installed is a mistake in the policy, not something to ignore.
function checkApps(policy: Policy, apps: readonly AppSpec[]): Effect.Effect<void, InstallError> {
  const names = new Set(apps.map((app) => app.name));
  const unknown = Object.keys(policy.apps).filter((name) => !names.has(name));

  if (names.size !== apps.length)
    return Effect.fail(new InstallError({ message: "two apps share a name" }));

  if (unknown.length > 0)
    return Effect.fail(
      new InstallError({ message: `policy grants unknown apps: ${unknown.join(", ")}` }),
    );

  return Effect.void;
}

// The `workerd` package selects its platform binary through optional dependencies.
function workerdBinary(): string {
  const arch = process.arch === "x64" ? "64" : process.arch;
  const fromWorkerd = createRequire(createRequire(import.meta.url).resolve("workerd/package.json"));

  return fromWorkerd.resolve(`@cloudflare/workerd-${process.platform}-${arch}/bin/workerd`);
}

function bundleWorker(outfile: string): Effect.Effect<void, InstallError> {
  const args = [
    "build",
    WORKER_ENTRY,
    "--outfile",
    outfile,
    "--target",
    "browser",
    "--format",
    "esm",
  ];

  const result = spawnSync(process.execPath, [...args, "--minify", "--external", "cloudflare:*"], {
    encoding: "utf8",
  });

  return result.status === 0
    ? Effect.void
    : Effect.fail(new InstallError({ message: `bundling the worker failed: ${result.stderr}` }));
}

function attempt(what: string, run: () => void): Effect.Effect<void, InstallError> {
  return Effect.try({
    try: run,
    catch: (cause) => new InstallError({ message: `cannot ${what}: ${String(cause)}` }),
  });
}
