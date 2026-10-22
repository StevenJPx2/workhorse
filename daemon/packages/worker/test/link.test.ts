import { describe, expect, it } from "@effect/vitest";
import type { LinkEffect } from "@workhorse/core";
import {
  type Deployment,
  ErrorCode,
  fromBase64url,
  linkTranscript,
  type Message,
  type Policy,
  toBase64url,
} from "@workhorse/protocol";
import { Effect, Option, Schema } from "effect";
import type { Env } from "../src/env.ts";
import { acceptUpgrade } from "../src/link/accept-upgrade.ts";
import { linkPeerOf } from "../src/link/link-peer-of.ts";
import { PEER_HEADER } from "../src/link/peer-header.ts";
import { peerNameByKey } from "../src/link/peer-name-by-key.ts";
import { performLinkEffect, type SessionPort } from "../src/link/perform-link-effect.ts";
import { redialDelay } from "../src/link/redial-delay.ts";

const certificate = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n";
const laptopKey = `${"L".repeat(42)}A`;

const policy: Policy = {
  apps: {},
  peers: {
    laptop: { key: laptopKey, certificate, operations: ["notes.read"] },
    home: { key: `${"H".repeat(42)}A`, certificate, address: "home.lan:7841", operations: [] },
  },
};

describe("the policy's peers", () => {
  it("finds a peer by name, with its grants and address", () => {
    expect(linkPeerOf(policy, "laptop")).toEqual({
      name: "laptop",
      key: laptopKey,
      operations: new Set(["notes.read"]),
      address: undefined,
    });
    expect(linkPeerOf(policy, "home")?.address).toBe("home.lan:7841");
    expect(linkPeerOf(policy, "office")).toBeUndefined();
    expect(linkPeerOf(policy, "constructor")).toBeUndefined();
    expect(linkPeerOf({ apps: {} }, "laptop")).toBeUndefined();
  });

  it("finds a peer's name by its key", () => {
    expect(peerNameByKey(policy, laptopKey)).toBe("laptop");
    expect(peerNameByKey(policy, `${"X".repeat(42)}A`)).toBeUndefined();
  });

  it("backs off 100, 250, 500, 1000 ms, then every 2 s", () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(redialDelay)).toEqual([
      100, 250, 500, 1000, 2000, 2000, 2000,
    ]);
  });
});

const forwarded: { readonly peer: string; readonly request: Request }[] = [];
const deployment = Option.some<Deployment>({ policy, apps: [] });

const unused = () => {
  throw new Error("not used by these effects");
};

// Records each upgrade handed to a peer's Link object, which accepts it.
const forward = (peer: string, request: Request) => {
  forwarded.push({ peer, request });

  return Promise.resolve(new Response("accepted"));
};

const upgrade = (path: string, headers: Record<string, string>) =>
  new Request(`https://daemon.workhorse${path}`, { headers: { Upgrade: "websocket", ...headers } });

const status = (request: Request) =>
  Effect.map(acceptUpgrade(request, deployment, forward), (r) => r.status);

describe("acceptUpgrade", () => {
  it.effect(
    "forwards a paired key's upgrade to that peer's Link object, naming the peer itself",
    () =>
      Effect.gen(function* () {
        const response = yield* acceptUpgrade(
          upgrade("/link", { "workhorse-key": laptopKey, [PEER_HEADER]: "home" }),
          deployment,
          forward,
        );

        expect(yield* Effect.promise(() => response.text())).toBe("accepted");
        expect(forwarded.at(-1)?.peer).toBe("laptop");
        // A dialer cannot pick the peer: the header is always overwritten from the key.
        expect(forwarded.at(-1)?.request.headers.get(PEER_HEADER)).toBe("laptop");
      }),
  );

  it.effect("refuses unpaired keys, other paths, and plain requests", () =>
    Effect.gen(function* () {
      const before = forwarded.length;

      expect(yield* status(upgrade("/link", { "workhorse-key": `${"X".repeat(42)}A` }))).toBe(403);
      expect(yield* status(upgrade("/link", {}))).toBe(403);
      expect(yield* status(upgrade("/other", { "workhorse-key": laptopKey }))).toBe(404);
      expect(yield* status(new Request("https://daemon.workhorse/link"))).toBe(404);
      expect(
        yield* Effect.map(
          acceptUpgrade(upgrade("/link", { "workhorse-key": laptopKey }), Option.none(), forward),
          (r) => r.status,
        ),
      ).toBe(403);
      expect(forwarded.length).toBe(before);
    }),
  );
});

const dialer = { key: laptopKey, nonce: `${"n".repeat(42)}E` };

// A Link namespace these effects never reach.
const links: Env["LINK"] = {
  get: unused,
  idFromName: unused,
  idFromString: unused,
  newUniqueId: unused,
  getByName: unused,
  jurisdiction: unused,
};

const decodeSigned = Schema.decodeUnknownSync(
  Schema.Struct({ result: Schema.Struct({ signature: Schema.String }) }),
);

// A session's port that records what effects did, with a fresh Ed25519 key.
const recordingPort = Effect.gen(function* () {
  const pair = yield* Effect.promise(() =>
    crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]),
  );

  if (!("privateKey" in pair)) return yield* Effect.die("Ed25519 must generate a key pair");
  const raw = yield* Effect.promise(() => crypto.subtle.exportKey("raw", pair.publicKey));

  if (!(raw instanceof ArrayBuffer)) return yield* Effect.die("a raw key must be bytes");
  const sent: Message[] = [];
  const ended: string[] = [];
  const settled: unknown[] = [];

  const port: SessionPort = {
    deps: {
      env: { DEPLOYMENT: {}, IDENTITY: {}, LOADER: { get: unused, load: unused }, LINK: links },
      ctx: { exports: { Fs: unused } },
      context: { apps: new Map(), peers: new Map() },
      specs: new Map(),
      privateKey: pair.privateKey,
    },
    send: (message) => Effect.sync(() => void sent.push(message)),
    settle: (id, outcome) => void settled.push({ id, outcome }),
    callApp: unused,
    end: (reason) => Effect.sync(() => void ended.push(reason)),
  };

  const key = toBase64url(new Uint8Array(raw));

  return { port, pair, key, sent, ended, settled };
});

describe("performLinkEffect: signatures", () => {
  it.effect("answers link.hello with a signature over the acceptor's transcript", () =>
    Effect.gen(function* () {
      const { port, pair, key, sent } = yield* recordingPort;
      const own = { key, nonce: `${"m".repeat(42)}E` };

      const effect: LinkEffect = {
        type: "reply_hello",
        id: "link.hello",
        result: { protocol: 1, key, nonce: own.nonce },
        sign: { signer: "acceptor", dialer, acceptor: own },
      };

      expect(yield* performLinkEffect(port, effect)).toBeUndefined();
      expect(sent).toMatchObject([{ id: "link.hello", result: { protocol: 1, key } }]);
      const signature = fromBase64url(decodeSigned(sent[0]).result.signature);

      const valid = (signer: "acceptor" | "dialer") =>
        Effect.promise(() =>
          crypto.subtle.verify(
            { name: "Ed25519" },
            pair.publicKey,
            signature,
            linkTranscript(signer, dialer, own),
          ),
        );

      expect(yield* valid("acceptor")).toBe(true);
      expect(yield* valid("dialer")).toBe(false);
    }),
  );

  it.effect("returns the answer of a verification as the next event", () =>
    Effect.gen(function* () {
      const { port, pair, key } = yield* recordingPort;
      const acceptor = { key: `${"H".repeat(42)}A`, nonce: `${"h".repeat(42)}E` };
      const transcript = { signer: "dialer" as const, dialer: { ...dialer, key }, acceptor };
      const bytes = linkTranscript("dialer", transcript.dialer, acceptor);

      const good = yield* Effect.promise(() =>
        crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, bytes),
      );

      const signature = toBase64url(new Uint8Array(good));
      const forged = `${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`;

      const verify = (candidate: string) =>
        performLinkEffect(port, { type: "verify", key, signature: candidate, transcript });

      expect(yield* verify(signature)).toEqual({ type: "verified", valid: true });
      expect(yield* verify(forged)).toEqual({ type: "verified", valid: false });
    }),
  );
});

describe("performLinkEffect: answers and endings", () => {
  it.effect("settles answers, sends refusals, and ends the session on close or a failed send", () =>
    Effect.gen(function* () {
      const { port, sent, ended, settled } = yield* recordingPort;
      const outcome = { result: { text: "x" } };

      const refusal: LinkEffect = {
        type: "refuse",
        id: 4,
        code: ErrorCode.denied,
        message: "denied",
      };

      yield* performLinkEffect(port, { type: "settle", id: 3, outcome });
      yield* performLinkEffect(port, refusal);
      yield* performLinkEffect(port, { type: "close", reason: "bad signature" });
      expect(settled).toEqual([{ id: 3, outcome }]);
      expect(sent).toEqual([
        { jsonrpc: "2.0", id: 4, error: { code: ErrorCode.denied, message: "denied" } },
      ]);
      expect(ended).toEqual(["bad signature"]);

      const broken: SessionPort = {
        ...port,
        send: () =>
          Effect.try(() => {
            throw new Error("socket closed");
          }),
      };

      yield* performLinkEffect(broken, { type: "reply", id: 5, result: {} });
      expect(ended).toEqual(["bad signature", "cannot sign or send"]);
    }),
  );
});
