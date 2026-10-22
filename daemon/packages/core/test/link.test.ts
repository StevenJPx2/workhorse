import { ErrorCode } from "@workhorse/protocol/constants";
import type { LinkMessage } from "@workhorse/protocol";
import { describe, expect, it } from "vite-plus/test";
import {
  acceptLink,
  dialLink,
  type LinkContext,
  type LinkPeer,
  type LinkState,
  linkStep,
} from "../src/index.ts";

const laptopKey = `${"L".repeat(42)}A`;
const homeKey = `${"H".repeat(42)}A`;
const laptopSide = { key: laptopKey, nonce: `${"l".repeat(42)}E` };
const homeSide = { key: homeKey, nonce: `${"h".repeat(42)}E` };
const signature = `${"s".repeat(85)}A`;

// On home, the laptop may read notes; on the laptop, home is the peer it dials.
const laptop: LinkPeer = { name: "laptop", key: laptopKey, operations: new Set(["notes.read"]) };
const home: LinkPeer = { name: "home", key: homeKey, operations: new Set() };

const atHome: LinkContext = {
  apps: new Map([["notes", new Set(["read", "write"])]]),
  peers: new Map([[laptopKey, laptop]]),
};

const atLaptop: LinkContext = { apps: new Map(), peers: new Map([[homeKey, home]]) };

const message = (linkMessage: LinkMessage) => ({ type: "message", message: linkMessage }) as const;
const verified = (valid: boolean) => ({ type: "verified", valid }) as const;

const helloFrom = (key: string) =>
  message({
    type: "hello",
    id: "link.hello",
    params: { protocol: [1], key, nonce: laptopSide.nonce },
  });

describe("the handshake, acceptor side", () => {
  it("answers a paired key, checks its proof, and opens", () => {
    const hello = linkStep(atHome, acceptLink(homeSide), helloFrom(laptopKey));

    expect(hello.effects).toEqual([
      {
        type: "reply_hello",
        id: "link.hello",
        result: { protocol: 1, key: homeKey, nonce: homeSide.nonce },
        sign: { signer: "acceptor", dialer: laptopSide, acceptor: homeSide },
      },
    ]);

    const prove = linkStep(
      atHome,
      hello.state,
      message({ type: "prove", id: "link.prove", params: { signature } }),
    );

    expect(prove.effects).toEqual([
      {
        type: "verify",
        key: laptopKey,
        signature,
        transcript: { signer: "dialer", dialer: laptopSide, acceptor: homeSide },
      },
    ]);
    expect(linkStep(atHome, prove.state, verified(true))).toEqual({
      state: { phase: "ready", peer: laptop, version: 1 },
      effects: [
        { type: "reply", id: "link.prove", result: {} },
        { type: "open", peer: "laptop" },
      ],
    });
  });

  it("refuses an unpaired key, an unsupported version, and a bad proof, then closes", () => {
    expect(linkStep(atHome, acceptLink(homeSide), helloFrom(homeKey)).effects).toMatchObject([
      { type: "refuse", code: ErrorCode.denied },
      { type: "close", reason: "unknown key" },
    ]);

    const oldHello = message({
      type: "hello",
      id: "link.hello",
      params: { protocol: [7], key: laptopKey, nonce: laptopSide.nonce },
    });

    expect(linkStep(atHome, acceptLink(homeSide), oldHello).effects).toMatchObject([
      { type: "refuse", code: ErrorCode.invalidParams },
      { type: "close" },
    ]);

    const checking: LinkState = { phase: "checking_proof", peer: laptop, version: 1, id: 9 };

    expect(linkStep(atHome, checking, verified(false))).toEqual({
      state: { phase: "closed" },
      effects: [
        { type: "refuse", id: 9, code: ErrorCode.denied, message: "denied" },
        { type: "close", reason: "bad signature" },
      ],
    });
  });

  it("closes when anything but the handshake comes first, or in the wrong order", () => {
    const call = message({ type: "call", id: 1, method: "notes.read", params: undefined });

    expect(linkStep(atHome, acceptLink(homeSide), call).state).toEqual({ phase: "closed" });

    const hello = linkStep(atHome, acceptLink(homeSide), helloFrom(laptopKey));

    expect(linkStep(atHome, hello.state, call).state).toEqual({ phase: "closed" });
    expect(linkStep(atHome, hello.state, helloFrom(laptopKey)).state).toEqual({ phase: "closed" });
  });
});

describe("the handshake, dialer side", () => {
  const result = { protocol: 1, key: homeKey, nonce: homeSide.nonce, signature };

  it("checks home's key and signature, proves its own key, and opens", () => {
    const dial = dialLink(home, laptopSide);

    expect(dial.effects).toEqual([
      { type: "send_hello", params: { protocol: [1], key: laptopKey, nonce: laptopSide.nonce } },
    ]);

    const answered = linkStep(atLaptop, dial.state, message({ type: "hello_result", result }));

    expect(answered.effects).toEqual([
      {
        type: "verify",
        key: homeKey,
        signature,
        transcript: { signer: "acceptor", dialer: laptopSide, acceptor: homeSide },
      },
    ]);

    const proving = linkStep(atLaptop, answered.state, verified(true));

    expect(proving.effects).toEqual([
      { type: "send_prove", sign: { signer: "dialer", dialer: laptopSide, acceptor: homeSide } },
    ]);
    expect(linkStep(atLaptop, proving.state, message({ type: "prove_result" }))).toEqual({
      state: { phase: "ready", peer: home, version: 1 },
      effects: [{ type: "open", peer: "home" }],
    });
  });

  it("closes when answered by another key, a bad signature, or a refusal", () => {
    const sent = dialLink(home, laptopSide).state;
    const impostor = { ...result, key: laptopKey };

    expect(
      linkStep(atLaptop, sent, message({ type: "hello_result", result: impostor })).effects,
    ).toEqual([{ type: "close", reason: "answered by an unpaired key" }]);

    const answered = linkStep(atLaptop, sent, message({ type: "hello_result", result })).state;

    expect(linkStep(atLaptop, answered, verified(false)).state).toEqual({ phase: "closed" });

    const refused = message({
      type: "response",
      id: "link.hello",
      outcome: { error: { code: ErrorCode.denied, message: "denied" } },
    });

    expect(linkStep(atLaptop, sent, refused).state).toEqual({ phase: "closed" });
  });
});

const call = (method: string) =>
  message({ type: "call", id: 4, method, params: { path: "todo.md" } });

describe("an open link", () => {
  const ready: LinkState = { phase: "ready", peer: laptop, version: 1 };

  it("lets a peer call only the operations its policy lists, on apps here", () => {
    expect(linkStep(atHome, ready, call("notes.read")).effects).toEqual([
      { type: "call_app", id: 4, app: "notes", operation: "read", params: { path: "todo.md" } },
    ]);

    for (const method of ["notes.write", "fs.read", "mail.read", "link.hello"]) {
      expect(linkStep(atHome, ready, call(method)).effects).toEqual([
        {
          type: "refuse",
          id: 4,
          code: ErrorCode.denied,
          message: "denied",
          data: { capability: method, reason: "no_grant" },
        },
      ]);
    }
  });

  it("reports a listed operation whose app is not here as not found", () => {
    const gone: LinkContext = { ...atHome, apps: new Map() };

    expect(linkStep(gone, ready, call("notes.read")).effects).toMatchObject([
      { code: ErrorCode.methodNotFound },
    ]);
  });

  it("settles answers, ignores heartbeats, and refuses a second handshake", () => {
    const outcome = { result: { text: "x" } };

    expect(linkStep(atHome, ready, message({ type: "response", id: 3, outcome })).effects).toEqual([
      { type: "settle", id: 3, outcome },
    ]);
    expect(
      linkStep(atHome, ready, message({ type: "notification", method: "link.ping" })).effects,
    ).toEqual([]);
    expect(linkStep(atHome, ready, helloFrom(laptopKey)).effects).toMatchObject([
      { code: ErrorCode.invalidRequest, message: "handshake already done" },
    ]);
  });

  it("does nothing once closed, and closes on a verification nobody asked for", () => {
    expect(linkStep(atHome, { phase: "closed" }, call("notes.read")).effects).toEqual([]);
    expect(linkStep(atHome, ready, verified(true)).state).toEqual({ phase: "closed" });
  });
});
