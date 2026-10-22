import { describe, expect, it } from "vite-plus/test";
import { fromBase64url, toBase64url } from "../src/index.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("base64url", () => {
  it("matches RFC 4648 vectors, without padding", () => {
    expect(toBase64url(bytes(""))).toBe("");
    expect(toBase64url(bytes("f"))).toBe("Zg");
    expect(toBase64url(bytes("fo"))).toBe("Zm8");
    expect(toBase64url(bytes("foobar"))).toBe("Zm9vYmFy");
  });

  it("uses the URL-safe alphabet", () => {
    expect(toBase64url(Uint8Array.of(0xfb, 0xff, 0xbf))).toBe("-_-_");
    expect([...fromBase64url("-_-_")]).toEqual([0xfb, 0xff, 0xbf]);
  });

  it("round-trips every length up to 70 bytes", () => {
    for (let size = 0; size <= 70; size += 1) {
      const original = crypto.getRandomValues(new Uint8Array(size));

      expect([...fromBase64url(toBase64url(original))]).toEqual([...original]);
    }
  });
});
