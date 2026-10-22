import { describe, expect, it } from "vite-plus/test";
import { encodeLine, LineReader } from "../src/framing.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("LineReader", () => {
  it("returns each complete line in a chunk and keeps the unfinished rest", () => {
    const reader = new LineReader(64);
    expect(reader.push(bytes('{"a":1}\n{"b":2}\n{"c"'))).toEqual({
      frames: [
        { type: "line", text: '{"a":1}' },
        { type: "line", text: '{"b":2}' },
      ],
      overflow: false,
    });
    expect(reader.push(bytes(":3}\n"))).toEqual({
      frames: [{ type: "line", text: '{"c":3}' }],
      overflow: false,
    });
  });

  it("joins a multi-byte character split across chunks", () => {
    const reader = new LineReader(64);
    const line = bytes("héllo\n");
    expect(reader.push(line.subarray(0, 2)).frames).toEqual([]);
    expect(reader.push(line.subarray(2)).frames).toEqual([{ type: "line", text: "héllo" }]);
  });

  it("skips empty lines", () => {
    expect(new LineReader(64).push(bytes("\n\n{}\n")).frames).toEqual([
      { type: "line", text: "{}" },
    ]);
  });

  it("reports invalid UTF-8 as its own frame and continues", () => {
    const reader = new LineReader(64);
    const chunk = new Uint8Array([0xff, 0x0a, ...bytes("{}\n")]);
    expect(reader.push(chunk).frames).toEqual([
      { type: "invalid_utf8" },
      { type: "line", text: "{}" },
    ]);
  });

  it("accepts a line of exactly the limit and rejects one byte more", () => {
    expect(new LineReader(4).push(bytes("abcd\n"))).toEqual({
      frames: [{ type: "line", text: "abcd" }],
      overflow: false,
    });
    expect(new LineReader(4).push(bytes("abcde\n")).overflow).toBe(true);
  });

  it("rejects an oversized line that never ends, a byte at a time, and stays stopped", () => {
    const reader = new LineReader(4);

    for (const byte of bytes("abcd"))
      expect(reader.push(new Uint8Array([byte])).overflow).toBe(false);
    expect(reader.push(bytes("e")).overflow).toBe(true);
    expect(reader.push(bytes("\n{}\n"))).toEqual({ frames: [], overflow: true });
  });

  it("keeps the lines that completed before an overflow in the same chunk", () => {
    expect(new LineReader(4).push(bytes("{}\nabcdef"))).toEqual({
      frames: [{ type: "line", text: "{}" }],
      overflow: true,
    });
  });
});

describe("encodeLine", () => {
  it("encodes a message containing newlines as exactly one line", () => {
    const message = { jsonrpc: "2.0", id: 1, result: { text: "two\nlines" } } as const;
    const line = encodeLine(message);
    expect(line.indexOf("\n")).toBe(line.length - 1);
    expect(JSON.parse(line)).toEqual(message);
  });
});
