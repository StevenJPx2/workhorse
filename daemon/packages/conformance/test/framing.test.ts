import { describe, expect, it } from "@effect/vitest";
import { ErrorCode, MAX_LINE_BYTES } from "@workhorse/protocol";
import { Effect } from "effect";
import { exchangeRaw } from "./daemon.ts";

const hello = '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"protocol":[1]}}\n';

describe("framing", () => {
  it.live("answers an unreadable line with a parse error and keeps the connection", () =>
    Effect.gen(function* () {
      const { lines, closed } = yield* exchangeRaw(`{not json\n${hello}`, 2);
      expect(closed).toBe(false);
      expect(lines.map((line) => JSON.parse(line))).toEqual([
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: ErrorCode.parseError, message: "invalid JSON" },
        },
        { jsonrpc: "2.0", id: 1, result: { protocol: 1 } },
      ]);
    }),
  );

  it.live("reads two messages whose bytes arrive in one write", () =>
    Effect.gen(function* () {
      const { lines } = yield* exchangeRaw(`${hello}${hello.replace('"id":1', '"id":2')}`, 2);
      expect(lines.map((line) => JSON.parse(line).id)).toEqual([1, 2]);
    }),
  );

  it.live("refuses a line over the limit and closes the connection", () =>
    Effect.gen(function* () {
      const { lines, closed } = yield* exchangeRaw(`"${"x".repeat(MAX_LINE_BYTES)}"\n`, 2);
      expect(closed).toBe(true);
      expect(lines.map((line) => JSON.parse(line))).toEqual([
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: ErrorCode.invalidRequest, message: `line over ${MAX_LINE_BYTES} bytes` },
        },
      ]);
    }),
  );
});
