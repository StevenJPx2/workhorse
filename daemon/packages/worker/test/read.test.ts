import { describe, expect, it } from "@effect/vitest";
import { type Deployment, ErrorCode, MAX_READ_BYTES } from "@workhorse/protocol";
import { Effect, Option } from "effect";
import { planRead, readResponse } from "../src/read.ts";

const deployment = Option.some<Deployment>({
  policy: { apps: { notes: { fs: { roots: { notes: "/data/notes" }, mode: "read" } } } },
  apps: [],
});

describe("planRead", () => {
  it("fetches a granted path from its root's disk directory, encoding each segment", () => {
    expect(planRead(deployment, "notes", ["notes", "a/b c/%2e%2e"])).toEqual({
      type: "fetch",
      binding: "fs:notes:notes",
      url: "http://fs/a/b%20c/%252e%252e",
    });
  });

  it("answers without the disk when the arguments, policy or path do not allow a read", () => {
    const cases: Array<[string, readonly (string | number | null)[], object]> = [
      ["notes", ["notes", 7], { code: ErrorCode.invalidParams }],
      ["notes", ["notes"], { code: ErrorCode.invalidParams }],
      [
        "other",
        ["notes", "todo.md"],
        { code: ErrorCode.denied, data: { capability: "fs.read", reason: "no_grant" } },
      ],
      [
        "constructor",
        ["notes", "todo.md"],
        { code: ErrorCode.denied, data: { reason: "no_grant" } },
      ],
      ["notes", ["notes", "../x"], { code: ErrorCode.denied, data: { reason: "outside_root" } }],
      ["notes", ["notes", "a//b"], { code: ErrorCode.invalidParams, message: "invalid path" }],
    ];

    for (const [app, args, error] of cases) {
      expect(planRead(deployment, app, args)).toMatchObject({ type: "answer", outcome: { error } });
    }
  });

  it("refuses every read when the deployment could not be decoded", () => {
    expect(planRead(Option.none(), "notes", ["notes", "todo.md"])).toMatchObject({
      outcome: { error: { code: ErrorCode.failed, data: { reason: "invalid_deployment" } } },
    });
  });
});

const reply = (body: BodyInit | null, status = 200) => new Response(body, { status });

const failed = (reason: string) => ({ error: { code: ErrorCode.failed, data: { reason } } });

describe("readResponse", () => {
  it.effect("returns the text of a file", () =>
    Effect.gen(function* () {
      expect(yield* readResponse(reply("buy milk\n"))).toEqual({ result: { text: "buy milk\n" } });
    }),
  );

  it.effect("serves exactly the limit and refuses one byte more", () =>
    Effect.gen(function* () {
      expect(yield* readResponse(reply("x".repeat(MAX_READ_BYTES)))).toMatchObject({ result: {} });
      expect(yield* readResponse(reply("x".repeat(MAX_READ_BYTES + 1)))).toMatchObject({
        error: { data: { reason: "too_large" } },
      });
    }),
  );

  it.effect("reports missing, unreadable and non-text files as failed", () =>
    Effect.gen(function* () {
      expect(yield* readResponse(reply(null, 404))).toMatchObject(failed("not_found"));
      expect(yield* readResponse(reply("internal error", 500))).toMatchObject(failed("unreadable"));
      expect(yield* readResponse(reply(new Uint8Array([0xff, 0xfe])))).toMatchObject(
        failed("not_text"),
      );
    }),
  );
});
