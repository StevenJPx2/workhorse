import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  fsyncSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import type { AppSpec, Deployment, Policy } from "@workhorse/protocol";
import { Config, Effect } from "effect";
import { checkLinks } from "./check-links/index.ts";
import { type DiskRoot, diskRoots, linkConfig, renderConfig } from "./config.ts";
import { ensureIdentity } from "./identity/ensure-identity.ts";
import { InstallError, readApp, readPolicy } from "./inputs.ts";
import { type Layout, layoutOf, MAX_SOCKET_PATH, peerCertificateFile } from "./layout.ts";
import { type Platform, register, serviceFiles } from "./register.ts";
import { must } from "./run.ts";
import { type Sandbox, sandboxedArgs, seatbeltProfile } from "./sandbox.ts";
import { warm } from "./warm.ts";

export type InstallOptions = {
  readonly base: string;
  readonly policy: string | undefined;
  readonly apps: readonly string[];
  readonly sandbox: "os" | "none";
  readonly service: "os" | "none";
  readonly label: string;
  // A glibc dynamic loader for systems whose loader is not at the standard path (NixOS).
  readonly loader: string | undefined;
  // `host:port` to accept links on; links are not accepted without it.
  readonly listen: string | undefined;
};

export type Installed = {
  readonly layout: Layout;
  readonly command: readonly string[];
  readonly service: boolean;
};

// Development builds bundle the worker from this workspace; a release ships the bundle.
const WORKER_ENTRY = join(import.meta.dirname, "..", "..", "worker", "src", "index.ts");

export const install = Effect.fnUntraced(function* (
  options: InstallOptions,
): Effect.fn.Return<Installed, InstallError> {
  const platform = yield* platformOf(process.platform);
  const layout = yield* prepare(options.base);

  const policy: Policy =
    options.policy === undefined ? { apps: {} } : yield* readPolicy(options.policy);

  const apps = yield* Effect.forEach(options.apps, readApp);
  yield* checkApps(policy, apps);
  yield* checkLinks(policy, apps);
  yield* ensureIdentity(layout);
  const deployment: Deployment = { policy, apps };
  const roots = diskRoots(policy);
  const links = linkConfig(policy, options.listen);
  yield* attempt("copy the workerd binary", () => {
    copyFileSync(workerdBinary(), layout.workerd);
    // The package may ship it world-writable; the daemon's binary is writable by its owner only.
    chmodSync(layout.workerd, 0o755);
  });

  if (options.loader !== undefined) {
    yield* must("patchelf", [
      "--set-interpreter",
      options.loader,
      "--set-rpath",
      dirname(options.loader),
      layout.workerd,
    ]);
  }

  // Durable before the service can start it. Until written back, a freshly copied binary's pages
  // also count as the daemon's own dirty memory on Linux (40 MB, slice 1).
  yield* attempt("flush the workerd binary", () => {
    const file = openSync(layout.workerd, "r");
    fsyncSync(file);
    closeSync(file);
  });
  yield* bundleWorker(layout.bundle);
  const sandbox = yield* chooseSandbox(options, platform, layout, roots);
  const command = sandboxedArgs(sandbox, layout, roots);
  yield* attempt("write the configuration", () => {
    writeFileSync(layout.deployment, JSON.stringify(deployment));
    writeFileSync(layout.config, renderConfig(layout, roots, links));
    writeFileSync(layout.command, JSON.stringify(command));

    for (const peer of links.dialed)
      writeFileSync(join(layout.etc, peerCertificateFile(peer.name)), peer.certificate);
  });

  if (options.service === "os") {
    yield* register(
      platform,
      options.label,
      serviceFiles(platform, options.label, layout, command),
    );
    // Loads the daemon's code now rather than on a client's first connection.
    yield* warm(layout.socket);
  }

  return { layout, command, service: options.service === "os" };
});

export function platformOf(platform: NodeJS.Platform): Effect.Effect<Platform, InstallError> {
  return platform === "darwin" || platform === "linux"
    ? Effect.succeed(platform)
    : Effect.fail(new InstallError({ message: `unsupported platform ${platform}` }));
}

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
    // Every connection is treated as the local user, so no other user may reach the socket.
    chmodSync(layout.base, 0o700);
    chmodSync(layout.sock, 0o700);
  });

  return layout;
});

const chooseSandbox = Effect.fnUntraced(function* (
  options: InstallOptions,
  platform: Platform,
  layout: Layout,
  roots: readonly DiskRoot[],
): Effect.fn.Return<Sandbox, InstallError> {
  if (options.sandbox === "none") return { type: "none" };

  if (platform === "darwin") {
    const profile = join(layout.etc, "sandbox.sb");
    yield* attempt("write the sandbox profile", () =>
      writeFileSync(profile, seatbeltProfile(layout, roots, options.listen)),
    );

    return { type: "seatbelt", profile };
  }

  return { type: "bubblewrap", bwrap: yield* findOnPath("bwrap"), loader: options.loader };
});

// An absolute path, because the service manager does not run with the user's PATH.
const findOnPath = Effect.fnUntraced(function* (
  program: string,
): Effect.fn.Return<string, InstallError> {
  const path = yield* Effect.orElseSucceed(Config.String("PATH"), () => "");

  const found = path
    .split(delimiter)
    .map((dir) => join(dir, program))
    .find((candidate) => spawnSync(candidate, ["--version"]).status === 0);

  return yield* Effect.mapError(
    Effect.fromNullishOr(found),
    () =>
      new InstallError({ message: `${program} is not installed; it is needed for the sandbox` }),
  );
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
