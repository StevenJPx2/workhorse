import {
  chmodSync,
  closeSync,
  copyFileSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Effect, type Scope } from "effect";
import { InstallError } from "./inputs.ts";
import { must } from "./run.ts";

/**
 * Stage, patch and flush a new workerd, then atomically replace the installed path. Overwriting
 * an executing binary fails with ETXTBSY on Linux; rename lets the current daemon keep its old
 * inode until the controlled restart. A failed preparation leaves the old binary untouched.
 */
export const installWorkerd = Effect.fnUntraced(function* (
  source: string,
  destination: string,
  loader: string | undefined,
): Effect.fn.Return<void, InstallError, Scope.Scope> {
  const staging = yield* Effect.acquireRelease(
    Effect.try({
      try: () => mkdtempSync(join(dirname(destination), ".install-")),
      catch: () => new InstallError({ message: "cannot stage the workerd binary" }),
    }),
    (folder) => Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
  );

  const binary = join(staging, "workerd");
  yield* Effect.try({
    try: () => {
      copyFileSync(source, binary);
      chmodSync(binary, 0o755);
    },
    catch: () => new InstallError({ message: "cannot copy the workerd binary" }),
  });

  if (loader !== undefined)
    yield* must("patchelf", ["--set-interpreter", loader, "--set-rpath", dirname(loader), binary]);

  yield* Effect.try({
    try: () => {
      const file = openSync(binary, "r");

      try {
        // Dirty page-cache pages of a fresh binary otherwise inflate Linux Private_Dirty.
        fsyncSync(file);
      } finally {
        closeSync(file);
      }

      renameSync(binary, destination);
    },
    catch: () => new InstallError({ message: "cannot flush and replace the workerd binary" }),
  });
}, Effect.scoped);
