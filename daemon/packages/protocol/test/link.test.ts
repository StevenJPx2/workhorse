import { describe, expect, it } from "vite-plus/test";
import { ErrorCode, type Json, linkTranscript, readLinkMessage } from "../src/index.ts";

const dialer = { key: "d".repeat(42) + "A", nonce: "n".repeat(42) + "E" };
const acceptor = { key: "a".repeat(42) + "Q", nonce: "m".repeat(42) + "g" };
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("linkTranscript", () => {
  it("names the label, the signer, both keys and both nonces, in a fixed order", () => {
    expect(text(linkTranscript("dialer", dialer, acceptor))).toBe(
      ["workhorse-link-v1", "dialer", dialer.key, acceptor.key, dialer.nonce, acceptor.nonce].join(
        "\n",
      ),
    );
  });

  it("differs by signer, so one side's signature cannot stand for the other's", () => {
    const asDialer = text(linkTranscript("dialer", dialer, acceptor));

    expect(text(linkTranscript("acceptor", dialer, acceptor))).not.toBe(asDialer);
  });

  it("differs when the sides swap, so a link cannot be replayed in reverse", () => {
    const forward = text(linkTranscript("dialer", dialer, acceptor));

    expect(text(linkTranscript("dialer", acceptor, dialer))).not.toBe(forward);
  });
});

describe("readLinkMessage", () => {
  it("classifies calls, notifications, results and errors", () => {
    expect(
      readLinkMessage('{"jsonrpc":"2.0","id":3,"method":"notes.read","params":{"p":1}}'),
    ).toEqual({
      type: "call",
      id: 3,
      method: "notes.read",
      params: { p: 1 },
    });
    expect(readLinkMessage('{"jsonrpc":"2.0","method":"link.ping"}')).toEqual({
      type: "notification",
      method: "link.ping",
    });
    expect(readLinkMessage('{"jsonrpc":"2.0","id":3,"result":{"text":"x"}}')).toEqual({
      type: "response",
      id: 3,
      outcome: { result: { text: "x" } },
    });
    expect(
      readLinkMessage('{"jsonrpc":"2.0","id":4,"error":{"code":-32003,"message":"unavailable"}}'),
    ).toEqual({
      type: "response",
      id: 4,
      outcome: { error: { code: -32003, message: "unavailable" } },
    });
  });

  it("refuses text that is not JSON or not a JSON-RPC 2.0 message", () => {
    expect(readLinkMessage("nope")).toEqual({
      type: "invalid",
      id: null,
      code: ErrorCode.parseError,
      message: "invalid JSON",
    });

    for (const message of ['{"id":1,"method":"x"}', '{"jsonrpc":"2.0","id":1}', "[]", "null"]) {
      expect(readLinkMessage(message)).toEqual({
        type: "invalid",
        id: null,
        code: ErrorCode.invalidRequest,
        message: "not a JSON-RPC 2.0 message",
      });
    }
  });
});

const hello = { protocol: [1], key: dialer.key, nonce: dialer.nonce };
const signature = `${"s".repeat(85)}A`;
const message = (body: Json) => readLinkMessage(JSON.stringify(body));

describe("readLinkMessage: handshake", () => {
  it("decodes the handshake requests, and refuses malformed ones with their id", () => {
    expect(message({ jsonrpc: "2.0", id: 1, method: "link.hello", params: hello })).toEqual({
      type: "hello",
      id: 1,
      params: hello,
    });
    expect(message({ jsonrpc: "2.0", id: 2, method: "link.prove", params: { signature } })).toEqual(
      {
        type: "prove",
        id: 2,
        params: { signature },
      },
    );
    expect(
      message({ jsonrpc: "2.0", id: 1, method: "link.hello", params: { ...hello, key: "x" } }),
    ).toMatchObject({
      type: "invalid",
      id: 1,
      code: ErrorCode.invalidParams,
    });
    expect(message({ jsonrpc: "2.0", id: 2, method: "link.prove", params: {} })).toMatchObject({
      type: "invalid",
      id: 2,
      code: ErrorCode.invalidParams,
    });
  });

  it("decodes the answers to our own handshake requests by their fixed ids", () => {
    const result = { protocol: 1, key: acceptor.key, nonce: acceptor.nonce, signature };

    expect(message({ jsonrpc: "2.0", id: "link.hello", result })).toEqual({
      type: "hello_result",
      result,
    });
    expect(message({ jsonrpc: "2.0", id: "link.prove", result: {} })).toEqual({
      type: "prove_result",
    });
    // A malformed hello result, or an error, stays a plain response for the handshake to refuse.
    expect(message({ jsonrpc: "2.0", id: "link.hello", result: { protocol: 1 } })).toMatchObject({
      type: "response",
      id: "link.hello",
    });
    expect(
      message({ jsonrpc: "2.0", id: "link.prove", error: { code: -32001, message: "denied" } }),
    ).toEqual({
      type: "response",
      id: "link.prove",
      outcome: { error: { code: -32001, message: "denied" } },
    });
  });
});
