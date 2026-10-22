import { describe, expect, it } from "@effect/vitest";
import { type Deployment, ErrorCode, MAX_LINE_BYTES } from "@workhorse/protocol";
import { Effect, Option } from "effect";
import type { Context } from "../src/apps.ts";
import { admit, type ByteSocket, MAX_CONNECTIONS, serve } from "../src/connection.ts";
import type { Env } from "../src/env.ts";
import { responseOf } from "../src/response-of.ts";

const deployment: Deployment = { policy: { apps: {} }, apps: [] };

describe("admit", () => {
  it("refuses when the deployment is invalid or the connection limit is reached", () => {
    expect(admit(Option.none(), 0)).toMatchObject({
      response: { error: { code: ErrorCode.failed } },
    });
    expect(admit(Option.some(deployment), MAX_CONNECTIONS)).toMatchObject({
      response: { id: null, error: { code: ErrorCode.limited, message: "too many connections" } },
    });
    expect(admit(Option.some(deployment), MAX_CONNECTIONS - 1).type).toBe("admitted");
  });
});

describe("responseOf", () => {
  it("writes a reply, and a refusal with data only when there is data", () => {
    expect(responseOf({ type: "reply", id: 1, result: { protocol: 1 } })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { protocol: 1 },
    });
    expect(
      responseOf({ type: "refuse", id: null, code: ErrorCode.parseError, message: "invalid JSON" }),
    ).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: ErrorCode.parseError, message: "invalid JSON" },
    });
  });
});

// A socket whose client sends `input` and then finishes; everything the daemon writes is kept.
function memorySocket(input: string) {
  const written: string[] = [];
  let closed = false;
  const decoder = new TextDecoder();

  const socket: ByteSocket = {
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input));
        controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write: (chunk) => void written.push(decoder.decode(chunk)),
    }),
    close: () => {
      closed = true;

      return Promise.resolve();
    },
  };

  return {
    socket,
    replies: () =>
      written
        .join("")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line)),
    closed: () => closed,
  };
}

const noLinks = () => {
  throw new Error("this test's deployment has no peers");
};

const env: Env = {
  DEPLOYMENT: deployment,
  IDENTITY: {},
  LINK: {
    get: noLinks,
    idFromName: noLinks,
    idFromString: noLinks,
    newUniqueId: noLinks,
    getByName: noLinks,
    jurisdiction: noLinks,
  },
  LOADER: {
    get: () => {
      throw new Error("this test's deployment has no apps");
    },
    load: () => {
      throw new Error("this test's deployment has no apps");
    },
  },
};

const ctx: Context = {
  exports: {
    Fs: () => {
      throw new Error("this test's deployment has no apps");
    },
  },
};

const hello = '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"protocol":[1]}}\n';

describe("serve", () => {
  it.effect("answers each line in order, then closes when the client finishes", () =>
    Effect.gen(function* () {
      const { socket, replies, closed } = memorySocket(
        `${hello}{bad\n{"jsonrpc":"2.0","id":2,"method":"x.y"}\n`,
      );

      yield* serve(socket, env, ctx);
      expect(replies()).toEqual([
        { jsonrpc: "2.0", id: 1, result: { protocol: 1 } },
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: ErrorCode.parseError, message: "invalid JSON" },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          error: { code: ErrorCode.methodNotFound, message: "no method x.y" },
        },
      ]);
      expect(closed()).toBe(true);
    }),
  );

  it.effect("refuses a line over the limit and stops reading", () =>
    Effect.gen(function* () {
      const { socket, replies, closed } = memorySocket(
        `${"x".repeat(MAX_LINE_BYTES + 1)}\n${hello}`,
      );

      yield* serve(socket, env, ctx);
      expect(replies()).toEqual([
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: ErrorCode.invalidRequest, message: `line over ${MAX_LINE_BYTES} bytes` },
        },
      ]);
      expect(closed()).toBe(true);
    }),
  );
});
