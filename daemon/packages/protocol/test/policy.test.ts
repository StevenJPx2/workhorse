import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { Nonce, PeerAddress, Policy, PublicKey, Signature } from "../src/index.ts";

// protocol runs in workerd too, so its tests use WebCrypto and plain base64 rather than node.
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));
const isKey = (text: string) => Option.isSome(Schema.decodeOption(PublicKey)(text));
const isNonce = (text: string) => Option.isSome(Schema.decodeOption(Nonce)(text));
const isSignature = (text: string) => Option.isSome(Schema.decodeOption(Signature)(text));
const isAddress = (text: string) => Option.isSome(Schema.decodeOption(PeerAddress)(text));
const decodePolicy = Schema.decodeUnknownOption(Policy, { onExcessProperty: "error" });

const certificate =
  "-----BEGIN CERTIFICATE-----\nMIIBhTCCASugAwIBAgIQ\nAAAA\n-----END CERTIFICATE-----\n";

/** A real Ed25519 public key and a signature by it, both encoded as the link encodes them. */
const ed25519 = Effect.fnUntraced(function* () {
  const pair = yield* Effect.promise(() =>
    crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]),
  );

  const raw = yield* Effect.promise(() => crypto.subtle.exportKey("raw", pair.publicKey));

  const signature = yield* Effect.promise(() =>
    crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, random(40)),
  );

  return {
    key: base64url(new Uint8Array(raw)),
    signature: base64url(new Uint8Array(signature)),
  };
});

describe("key, nonce and signature encodings", () => {
  it.effect("accept every real Ed25519 public key and signature, and random nonces", () =>
    Effect.gen(function* () {
      const keys = yield* Effect.all(Array.from({ length: 100 }, () => ed25519()));

      for (const real of keys) {
        expect(isKey(real.key)).toBe(true);
        expect(isSignature(real.signature)).toBe(true);
        expect(isNonce(base64url(random(32)))).toBe(true);
      }
    }),
  );

  it("refuse wrong lengths, padding, standard base64, and non-canonical last characters", () => {
    const raw = base64url(random(32));

    for (const bad of [
      raw.slice(1),
      `${raw}A`,
      `${raw}=`,
      `${raw.slice(0, 42)}B`,
      btoa(String.fromCodePoint(...random(32))),
      base64url(random(31)),
      base64url(random(33)),
    ]) {
      expect(isKey(bad)).toBe(false);
    }

    expect(isSignature(base64url(random(63)))).toBe(false);
    expect(isSignature(`${base64url(random(64)).slice(0, 85)}B`)).toBe(false);
  });
});

describe("PeerAddress", () => {
  it("accepts host names, IPv4 and bracketed IPv6 with a port", () => {
    for (const address of [
      "home.lan:7841",
      "100.104.65.112:7841",
      "[fd7a:115c:a1e0::1]:7841",
      "localhost:1",
      "h:65535",
    ]) {
      expect(isAddress(address)).toBe(true);
    }
  });

  it("refuses missing or out-of-range ports, schemes, paths and spaces", () => {
    for (const address of [
      "home.lan",
      "home.lan:0",
      "home.lan:65536",
      "home.lan:07841",
      "wss://home.lan:7841",
      "home.lan:7841/x",
      "fd7a::1:7841",
      "home lan:7841",
      "-home:7841",
      ":7841",
    ]) {
      expect(isAddress(address)).toBe(false);
    }
  });
});

describe("Policy", () => {
  it.effect("decodes peers and routes", () =>
    Effect.gen(function* () {
      const { key } = yield* ed25519();

      const policy = {
        apps: {},
        peers: {
          home: { key, certificate, address: "home.lan:7841", operations: [] },
          laptop: { key, certificate, operations: ["notes.read"] },
        },
        routes: { notes: "home" },
      };

      expect(Option.getOrUndefined(decodePolicy(policy))).toEqual(policy);
    }),
  );

  it("still decodes a policy with apps only", () => {
    expect(Option.isSome(decodePolicy({ apps: {} }))).toBe(true);
  });

  it.effect("refuses bad peers: unknown fields, bad keys, certificates or operations", () =>
    Effect.gen(function* () {
      const { key } = yield* ed25519();
      const peer = { key, certificate, operations: [] };
      const privateKey = "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n";

      for (const bad of [
        { ...peer, url: "wss://home.lan:7841" },
        { ...peer, key: "not-a-key" },
        { ...peer, certificate: privateKey },
        { ...peer, operations: ["notes"] },
        { ...peer, operations: ["fs.read.x"] },
        { key, certificate },
      ]) {
        expect(Option.isNone(decodePolicy({ apps: {}, peers: { home: bad } }))).toBe(true);
      }

      expect(Option.isNone(decodePolicy({ apps: {}, peers: { Home: peer } }))).toBe(true);
      expect(Option.isNone(decodePolicy({ apps: {}, routes: { notes: "Home" } }))).toBe(true);
    }),
  );
});
