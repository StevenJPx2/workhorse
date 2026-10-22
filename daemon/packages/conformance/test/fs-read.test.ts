import { describe, expect, it } from "@effect/vitest";
import { ErrorCode, MAX_READ_BYTES } from "@workhorse/protocol";
import { Effect } from "effect";
import { AT_LIMIT, NOTE, OVER_LIMIT } from "../src/fixtures.ts";
import { ready, request } from "./daemon.ts";

const denied = (reason: string) => ({
  error: { code: ErrorCode.denied, message: "denied", data: { capability: "fs.read", reason } },
});

describe("fs.read through an app's public operation", () => {
  it.live("reads a file inside the root the policy grants the app", () =>
    Effect.gen(function* () {
      const client = yield* ready;
      expect(yield* request(client, "notes.read", { path: NOTE.path })).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: { text: NOTE.text },
      });
    }),
  );

  it.live("denies paths that leave the root", () =>
    Effect.gen(function* () {
      const client = yield* ready;

      for (const path of ["../secrets.txt", "notes/../../secrets.txt", "/etc/passwd"]) {
        expect(yield* request(client, "notes.read", { path })).toMatchObject(
          denied("outside_root"),
        );
      }
    }),
  );

  it.live("rejects paths that are not plain names", () =>
    Effect.gen(function* () {
      const client = yield* ready;

      for (const path of ["./todo.md", "a//b", "", "a\u0000b", 7, null]) {
        expect(yield* request(client, "notes.read", { path })).toMatchObject({
          error: { code: ErrorCode.invalidParams },
        });
      }
    }),
  );

  it.live("reports a missing file as failed, not denied", () =>
    Effect.gen(function* () {
      const client = yield* ready;
      expect(yield* request(client, "notes.read", { path: "missing.md" })).toMatchObject({
        error: { code: ErrorCode.failed, data: { reason: "not_found" } },
      });
    }),
  );

  it.live("serves a file of exactly the read limit and refuses one byte more", () =>
    Effect.gen(function* () {
      const client = yield* ready;
      const atLimit = yield* request(client, "notes.read", { path: AT_LIMIT });
      expect(atLimit).toMatchObject({ result: { text: "x".repeat(MAX_READ_BYTES) } });
      expect(yield* request(client, "notes.read", { path: OVER_LIMIT })).toMatchObject({
        error: { code: ErrorCode.failed, data: { reason: "too_large" } },
      });
    }),
  );

  it.live("gives an outside client no file access of its own", () =>
    Effect.gen(function* () {
      const client = yield* ready;
      expect(yield* request(client, "fs.read", { root: "notes", path: NOTE.path })).toMatchObject(
        denied("no_grant"),
      );
    }),
  );

  it.live("reports an operation the app does not declare as not found", () =>
    Effect.gen(function* () {
      const client = yield* ready;
      expect(yield* request(client, "notes.write", { path: NOTE.path })).toMatchObject({
        error: { code: ErrorCode.methodNotFound },
      });
    }),
  );
});
