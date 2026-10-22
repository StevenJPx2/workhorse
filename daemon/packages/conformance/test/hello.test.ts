import { describe, expect, it } from "@effect/vitest";
import { ErrorCode, PROTOCOL_VERSION } from "@workhorse/protocol";
import { Effect } from "effect";
import { daemon, request } from "./daemon.ts";

describe("hello", () => {
  it.live("agrees on the version the client offers", () =>
    Effect.gen(function* () {
      const client = yield* daemon;
      expect(yield* request(client, "hello", { protocol: [PROTOCOL_VERSION] })).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { protocol: PROTOCOL_VERSION },
      });
    }),
  );

  it.live("picks the version both sides speak when the client offers several", () =>
    Effect.gen(function* () {
      const client = yield* daemon;
      const response = yield* request(client, "hello", { protocol: [PROTOCOL_VERSION, 99] });
      expect(response).toMatchObject({ result: { protocol: PROTOCOL_VERSION } });
    }),
  );

  it.live("refuses a client that speaks no supported version, and says which it supports", () =>
    Effect.gen(function* () {
      const client = yield* daemon;
      expect(yield* request(client, "hello", { protocol: [99] })).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: ErrorCode.invalidParams,
          message: "unsupported protocol version",
          data: { supported: [PROTOCOL_VERSION] },
        },
      });
    }),
  );

  it.live("refuses every other call before hello", () =>
    Effect.gen(function* () {
      const client = yield* daemon;
      const response = yield* request(client, "notes.read", { path: "todo.md" });
      expect(response).toMatchObject({
        error: { code: ErrorCode.invalidRequest, message: "hello first" },
      });
    }),
  );
});
