import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { installWorkerd } from "../src/install-workerd.ts";

describe("installWorkerd", () => {
  it.live("replaces an executing binary without modifying its inode", () =>
    Effect.gen(function* () {
      const folder = mkdtempSync(join(tmpdir(), "workhorse-binary-"));
      const destination = join(folder, "workerd");

      yield* installWorkerd("/bin/sleep", destination, undefined);
      const before = statSync(destination).ino;
      const child = spawn(destination, ["30"]);

      yield* Effect.callback<void>((resume) => {
        child.once("spawn", () => resume(Effect.void));
      });
      yield* installWorkerd("/bin/sleep", destination, undefined).pipe(
        Effect.ensuring(Effect.sync(() => child.kill("SIGKILL"))),
      );

      expect(statSync(destination).ino).not.toBe(before);
      expect(readFileSync(destination)).toEqual(readFileSync("/bin/sleep"));
      expect(readdirSync(folder)).toEqual(["workerd"]);
      rmSync(folder, { recursive: true, force: true });
    }),
  );

  it.effect("preserves the installed binary and cleans staging on a failed copy", () =>
    Effect.gen(function* () {
      const folder = mkdtempSync(join(tmpdir(), "workhorse-binary-"));
      const destination = join(folder, "workerd");

      yield* installWorkerd("/bin/sleep", destination, undefined);
      const before = statSync(destination).ino;

      const exit = yield* Effect.exit(
        installWorkerd(join(folder, "missing"), destination, undefined),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      expect(statSync(destination).ino).toBe(before);
      expect(readdirSync(folder)).toEqual(["workerd"]);
      rmSync(folder, { recursive: true, force: true });
    }),
  );
});
