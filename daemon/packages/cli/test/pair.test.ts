import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Option, Schema } from "effect";
import { acceptPairing } from "../src/pair/accept-pairing.ts";
import { addPeer } from "../src/pair/add-peer.ts";
import { dialPairing } from "../src/pair/dial-pairing.ts";
import { fingerprint } from "../src/pair/fingerprint.ts";
import { hostPort } from "../src/pair/host-port.ts";
import { pairSideOf } from "../src/pair/index.ts";
import { peerEntry } from "../src/pair/peer-entry.ts";

const certificate = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n";
const other = "-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----\n";
const homeKey = `${"H".repeat(42)}A`;
const laptopKey = `${"L".repeat(42)}A`;
const decodePort = Schema.decodeUnknownOption(Schema.Struct({ port: Schema.Int }));

// A port nothing listens on now.
const freePort = Effect.callback<number>((resume) => {
  const server = createServer();

  server.listen(0, "127.0.0.1", () => {
    const port = Option.match(decodePort(server.address()), {
      onNone: () => 0,
      onSome: (address) => address.port,
    });

    server.close(() => resume(Effect.succeed(port)));
  });
});

describe("fingerprint and addresses", () => {
  it("gives a short code that changes with the key or the certificate", () => {
    const code = fingerprint(homeKey, certificate);

    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(fingerprint(homeKey, certificate)).toBe(code);
    expect(fingerprint(homeKey, other)).not.toBe(code);
    expect(fingerprint(laptopKey, certificate)).not.toBe(code);
  });

  it.effect("reads the side from the command line, checking the address either way", () =>
    Effect.gen(function* () {
      expect(yield* pairSideOf(true, "0.0.0.0:7842", undefined)).toEqual({
        type: "accept",
        listen: "0.0.0.0:7842",
      });
      expect(yield* pairSideOf(false, undefined, "home.lan:7842")).toEqual({
        type: "dial",
        address: "home.lan:7842",
      });

      for (const [accept, listen, address] of [
        [true, undefined, "home.lan:7842"],
        [false, "0.0.0.0:7842", undefined],
        [false, undefined, "home.lan"],
      ] as const) {
        expect(Exit.isFailure(yield* Effect.exit(pairSideOf(accept, listen, address)))).toBe(true);
      }
    }),
  );

  it("splits host and port, unbracketing IPv6", () => {
    expect(hostPort("100.104.65.112:7842")).toEqual({ host: "100.104.65.112", port: 7842 });
    expect(hostPort("[fd7a::1]:7842")).toEqual({ host: "fd7a::1", port: 7842 });
  });
});

describe("the exchange", () => {
  it.live("swaps offers between an accepting and a dialing machine", () =>
    Effect.gen(function* () {
      const address = `127.0.0.1:${yield* freePort}`;
      const home = { key: homeKey, certificate, linkPort: 7841 };
      const laptop = { key: laptopKey, certificate: other };

      const [laptopSeen, homeSeen] = yield* Effect.all(
        [
          acceptPairing(address, home),
          Effect.flatMap(Effect.sleep("50 millis"), () => dialPairing(address, laptop)),
        ],
        { concurrency: 2 },
      );

      expect(laptopSeen).toEqual(laptop);
      expect(homeSeen).toEqual(home);
    }),
  );

  it.live("refuses an offer that is not valid", () =>
    Effect.gen(function* () {
      const port = yield* freePort;
      const server = createServer((socket) => socket.end('{"key":"not-a-key"}\n'));

      yield* Effect.callback<void>((resume) => {
        server.listen(port, "127.0.0.1", () => resume(Effect.void));
      });

      const exit = yield* Effect.exit(
        dialPairing(`127.0.0.1:${port}`, { key: laptopKey, certificate }),
      );

      server.close();
      expect(Exit.isFailure(exit) ? String(exit.cause) : "ok").toContain("not valid");
    }),
  );
});

describe("the policy entry", () => {
  it.effect("records where to dial on the dialing side only, and grants nothing", () =>
    Effect.gen(function* () {
      const theirs = { key: homeKey, certificate, linkPort: 7841 };

      expect(yield* peerEntry({ type: "dial", address: "100.104.65.112:7842" }, theirs)).toEqual({
        key: homeKey,
        certificate,
        address: "100.104.65.112:7841",
        operations: [],
      });
      expect(yield* peerEntry({ type: "accept", listen: "0.0.0.0:7842" }, theirs)).toEqual({
        key: homeKey,
        certificate,
        operations: [],
      });

      const noLinks = yield* Effect.exit(
        peerEntry({ type: "dial", address: "home.lan:7842" }, { key: homeKey, certificate }),
      );

      expect(Exit.isFailure(noLinks)).toBe(true);
    }),
  );

  it.effect("adds the peer, keeps roots as written, and refuses a name already paired", () =>
    Effect.gen(function* () {
      const file = join(mkdtempSync(join(tmpdir(), "workhorse-pair-")), "policy.json");
      const peer = { key: homeKey, certificate, address: "home.lan:7841", operations: [] };

      writeFileSync(
        file,
        JSON.stringify({ apps: { notes: { fs: { roots: { notes: "~/notes" }, mode: "read" } } } }),
      );
      yield* addPeer(file, "home", peer);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
        apps: { notes: { fs: { roots: { notes: "~/notes" }, mode: "read" } } },
        peers: { home: peer },
      });

      const again = yield* Effect.exit(addPeer(file, "home", peer));

      expect(Exit.isFailure(again) ? String(again.cause) : "ok").toContain("already pairs");
    }),
  );
});
