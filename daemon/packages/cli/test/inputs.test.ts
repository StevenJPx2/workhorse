import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { readApp, readPolicy, resolveRoot } from "../src/inputs.ts";

const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), "workhorse-cli-")));

const message = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E>) =>
  Effect.map(Effect.flip(effect), (error) => error.message);

describe("resolveRoot", () => {
  it.effect("expands ~ and resolves symlinked folders to their real path", () =>
    Effect.gen(function* () {
      expect(yield* resolveRoot("~")).toBe(realpathSync(homedir()));
      const dir = scratch();
      expect(yield* resolveRoot(dir.replace(/^\/private/, ""))).toBe(dir);
    }),
  );

  it.effect("refuses relative, missing, and unsafe paths", () =>
    Effect.gen(function* () {
      expect(yield* message(resolveRoot("notes"))).toContain("must be absolute");
      expect(yield* message(resolveRoot("/no/such/folder"))).toContain("does not exist");
      const quoted = join(scratch(), 'a"b');
      mkdirSync(quoted);
      expect(yield* message(resolveRoot(quoted))).toContain(
        "quote, backslash or control character",
      );
    }),
  );
});

describe("readPolicy", () => {
  it.effect("resolves every granted root", () =>
    Effect.gen(function* () {
      const dir = scratch();
      const file = join(dir, "policy.json");
      writeFileSync(
        file,
        JSON.stringify({ apps: { notes: { fs: { roots: { notes: dir }, mode: "read" } } } }),
      );
      expect(yield* readPolicy(file)).toEqual({
        apps: { notes: { fs: { roots: { notes: dir }, mode: "read" } } },
      });
    }),
  );

  it.effect("refuses unknown keys, invalid names and malformed JSON", () =>
    Effect.gen(function* () {
      const dir = scratch();
      const file = join(dir, "policy.json");

      for (const policy of [
        { apps: { notes: { fss: { roots: {}, mode: "read" } } } },
        { apps: { Notes: {} } },
        { apps: { notes: { fs: { roots: { "../x": dir }, mode: "read" } } } },
        { apps: { notes: { fs: { roots: {}, mode: "write" } } } },
      ]) {
        writeFileSync(file, JSON.stringify(policy));
        expect(yield* message(readPolicy(file))).toContain("invalid policy");
      }

      writeFileSync(file, "{");
      expect(yield* message(readPolicy(file))).toContain("invalid policy");
    }),
  );
});

describe("readApp", () => {
  it.effect("reads a manifest and its module", () =>
    Effect.gen(function* () {
      const dir = scratch();
      writeFileSync(
        join(dir, "manifest.json"),
        JSON.stringify({ name: "notes", operations: ["read"] }),
      );
      writeFileSync(join(dir, "app.js"), "export default {}");
      expect(yield* readApp(dir)).toEqual({
        name: "notes",
        operations: ["read"],
        source: "export default {}",
      });
    }),
  );

  it.effect("refuses a missing or invalid manifest", () =>
    Effect.gen(function* () {
      const dir = scratch();
      expect(yield* message(readApp(dir))).toContain("cannot read");
      writeFileSync(
        join(dir, "manifest.json"),
        JSON.stringify({ name: "notes", operations: ["read"], extra: 1 }),
      );
      expect(yield* message(readApp(dir))).toContain("invalid manifest");
    }),
  );
});
