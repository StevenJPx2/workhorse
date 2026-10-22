import { describe, expect, it } from "vite-plus/test";
import { ErrorCode, linkTranscript, readLinkMessage } from "../src/index.ts";

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
  it("classifies requests, notifications, results and errors", () => {
    expect(
      readLinkMessage('{"jsonrpc":"2.0","id":3,"method":"notes.read","params":{"p":1}}'),
    ).toEqual({
      type: "request",
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
      code: ErrorCode.parseError,
      message: "invalid JSON",
    });

    for (const message of ['{"id":1,"method":"x"}', '{"jsonrpc":"2.0","id":1}', "[]", "null"]) {
      expect(readLinkMessage(message)).toEqual({
        type: "invalid",
        code: ErrorCode.invalidRequest,
        message: "not a JSON-RPC 2.0 message",
      });
    }
  });
});
