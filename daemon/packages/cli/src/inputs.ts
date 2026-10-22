import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { AppManifest, type AppSpec, type FsGrant, Policy } from "@workhorse/protocol";
import { Effect, Schema } from "effect";

export class InstallError extends Schema.TaggedError<
  InstallError,
  { readonly InstallError: unique symbol }
>()("InstallError", { message: Schema.String }) {}

// Unknown keys are errors: a misspelt grant must not be silently dropped.
const strict = { onExcessProperty: "error" } as const;
const decodePolicy = Schema.decodeEffect(Schema.fromJsonString(Policy), strict);
const decodeManifest = Schema.decodeEffect(Schema.fromJsonString(AppManifest), strict);

const readText = (file: string) =>
  Effect.try({
    try: () => readFileSync(file, "utf8"),
    catch: (cause) => new InstallError({ message: `cannot read ${file}: ${String(cause)}` }),
  });

// Paths are written into the workerd config and the sandbox profile as quoted strings, so
// characters that need escaping there are refused rather than escaped.
const UNSAFE_PATH = /["\\\p{Cc}]/u;

export const resolveRoot = Effect.fnUntraced(function* (
  path: string,
): Effect.fn.Return<string, InstallError> {
  const expanded = path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;

  if (!isAbsolute(expanded))
    return yield* new InstallError({ message: `root ${path} must be absolute or start with ~` });

  // The sandbox matches resolved paths (/private/var, not /var), and the root must exist.
  const real = yield* Effect.try({
    try: () => realpathSync(expanded),
    catch: () => new InstallError({ message: `root ${path} does not exist` }),
  });

  if (UNSAFE_PATH.test(real))
    return yield* new InstallError({
      message: `root ${real} contains a quote, backslash or control character`,
    });

  return real;
});

// The policy with every root resolved to a real, absolute path.
export const readPolicy = Effect.fnUntraced(function* (
  file: string,
): Effect.fn.Return<Policy, InstallError> {
  const policy = yield* decodePolicy(yield* readText(file)).pipe(
    Effect.mapError(
      (error) => new InstallError({ message: `invalid policy ${file}: ${error.message}` }),
    ),
  );

  const apps = yield* Effect.forEach(Object.entries(policy.apps), ([name, grants]) =>
    grants.fs === undefined
      ? Effect.succeed([name, grants] as const)
      : Effect.map(resolveGrant(grants.fs), (fs) => [name, { ...grants, fs }] as const),
  );

  return { ...policy, apps: Object.fromEntries(apps) };
});

const resolveGrant = Effect.fnUntraced(function* (
  grant: FsGrant,
): Effect.fn.Return<FsGrant, InstallError> {
  const roots = yield* Effect.forEach(Object.entries(grant.roots), ([name, path]) =>
    Effect.map(resolveRoot(path), (real) => [name, real] as const),
  );

  return { ...grant, roots: Object.fromEntries(roots) };
});

// An app folder: manifest.json (name, operations) and app.js (one ES module).
export const readApp = Effect.fnUntraced(function* (
  dir: string,
): Effect.fn.Return<AppSpec, InstallError> {
  const manifest = yield* decodeManifest(yield* readText(join(dir, "manifest.json"))).pipe(
    Effect.mapError(
      (error) => new InstallError({ message: `invalid manifest in ${dir}: ${error.message}` }),
    ),
  );

  return { ...manifest, source: yield* readText(join(dir, "app.js")) };
});
