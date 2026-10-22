import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest";
import { ErrorCode } from "@workhorse/protocol";
import { Effect } from "effect";
import { NOTE } from "../src/fixtures.ts";
import { ENTRY } from "../src/linked-pair.ts";
import { call, type Running, runLinkedPair, untilAnswered, upgradeStatus } from "./linked.ts";

// Two daemons installed with the real CLI, each in its OS sandbox: "laptop" dials "home" over
// TLS, and each routes the other's app over that one link (docs/architecture.md, "Remote links").
let running: Running;

beforeAll(
  () => Effect.runPromise(Effect.map(runLinkedPair, (pair) => void (running = pair))),
  60_000,
);

afterAll(() => running?.remove());

const unavailable = { error: { code: ErrorCode.unavailable, message: "unavailable" } };

describe("a link between two daemons", () => {
  it.live(
    "answers a call routed to the peer with the peer's app, under the peer's policy",
    () =>
      Effect.gen(function* () {
        const laptop = yield* running.client("laptop");

        yield* call(laptop, "hello", { protocol: [1] });
        expect(yield* untilAnswered(laptop, "notes.read", { path: NOTE.path }, 5)).toMatchObject({
          result: { text: NOTE.text },
        });
        expect(yield* call(laptop, "notes.read", { path: "../secrets.txt" })).toMatchObject({
          error: {
            code: ErrorCode.denied,
            data: { capability: "fs.read", reason: "outside_root" },
          },
        });
        laptop.close();
      }),
    20_000,
  );

  it.live(
    "carries calls the other way over the same link, from the side that accepted it",
    () =>
      Effect.gen(function* () {
        const home = yield* running.client("home");

        yield* call(home, "hello", { protocol: [1] });
        expect(yield* untilAnswered(home, "journal.read", { path: ENTRY.path }, 5)).toMatchObject({
          result: { text: ENTRY.text },
        });
        home.close();
      }),
    20_000,
  );

  it.live("lets a peer call only the operations its policy entry lists", () =>
    Effect.gen(function* () {
      const laptop = yield* running.client("laptop");

      yield* call(laptop, "hello", { protocol: [1] });
      yield* untilAnswered(laptop, "notes.read", { path: NOTE.path }, 5);
      expect(yield* call(laptop, "notes.write", { path: NOTE.path })).toMatchObject({
        error: { code: ErrorCode.denied, data: { capability: "notes.write", reason: "no_grant" } },
      });
      laptop.close();
    }),
  );

  it.live("keeps link methods away from local clients", () =>
    Effect.gen(function* () {
      const laptop = yield* running.client("laptop");

      yield* call(laptop, "hello", { protocol: [1] });
      expect(yield* call(laptop, "link.hello", { protocol: [1] })).toMatchObject({
        error: { code: ErrorCode.methodNotFound },
      });
      laptop.close();
    }),
  );
});

describe("a link's trust and failures", () => {
  it.live("refuses an upgrade from a key the policy does not pair", () =>
    Effect.gen(function* () {
      expect(yield* upgradeStatus(running, `${"A".repeat(42)}A`)).toBe(403);
    }),
  );

  it.live(
    "answers unavailable at once while the peer is down, and recovers when it returns",
    () =>
      Effect.gen(function* () {
        const laptop = yield* running.client("laptop");

        yield* call(laptop, "hello", { protocol: [1] });
        yield* untilAnswered(laptop, "notes.read", { path: NOTE.path }, 5);
        running.kill("home");
        yield* Effect.sleep("300 millis");
        expect(yield* call(laptop, "notes.read", { path: NOTE.path })).toEqual({
          jsonrpc: "2.0",
          id: 3,
          ...unavailable,
        });

        yield* running.start("home");
        expect(yield* untilAnswered(laptop, "notes.read", { path: NOTE.path }, 5)).toMatchObject({
          result: { text: NOTE.text },
        });
        laptop.close();
      }),
    30_000,
  );

  it.live(
    "drops a peer that stops answering, through heartbeats, and relinks when it wakes",
    () =>
      Effect.gen(function* () {
        const laptop = yield* running.client("laptop");

        yield* call(laptop, "hello", { protocol: [1] });
        yield* untilAnswered(laptop, "notes.read", { path: NOTE.path }, 5);
        running.signal("home", "SIGSTOP");
        // Three missed heartbeats (15 s), plus one heartbeat interval for the check to run.
        yield* Effect.sleep("21 seconds");
        expect(yield* call(laptop, "notes.read", { path: NOTE.path })).toMatchObject(unavailable);

        running.signal("home", "SIGCONT");
        expect(yield* untilAnswered(laptop, "notes.read", { path: NOTE.path }, 10)).toMatchObject({
          result: { text: NOTE.text },
        });
        laptop.close();
      }),
    60_000,
  );
});
