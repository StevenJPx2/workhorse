import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import web_read from "../web_read";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const read = (input: Record<string, unknown>, env: Record<string, unknown> = {}) =>
  runTool(web_read, input, { env });

describe("web_read — help", () => {
  it("returns documentation without a network call", async () => {
    const { output } = await read({ help: true });

    expect(output).toContain("web_read");
    expect(output).toContain("WHEN TO USE");
  });
});

describe("web_read — reading", () => {
  it("returns the reader's markdown", async () => {
    stub = stubFetch({ "r.jina.ai": "# Title\n\nBody text." });
    const { output } = await read({ url: "https://example.com" });

    expect(output).toBe("# Title\n\nBody text.");
  });

  it("routes the target through the reader prefix", async () => {
    stub = stubFetch({ "r.jina.ai": "md" });
    await read({ url: "https://example.com/docs" });

    expect(stub.urls()[0]).toBe("https://r.jina.ai/https://example.com/docs");
  });

  it("discards link markup — agents read prose, not link farms", async () => {
    stub = stubFetch({ "r.jina.ai": "md" });
    await read({ url: "https://example.com" });

    expect(stub.requests[0].headers["x-md-link-style"]).toBe("discarded");
  });

  it("sends the key when configured and omits the header when not", async () => {
    stub = stubFetch({ "r.jina.ai": "md" });
    await read({ url: "https://example.com" }, { JINA_API_KEY: "k" });
    expect(stub.requests[0].headers.authorization).toBe("Bearer k");

    stub.restore();
    stub = stubFetch({ "r.jina.ai": "md" });
    await read({ url: "https://example.com" });
    // The reader works keyless (rate-limited), so a missing key must not
    // produce an `Bearer undefined` header.
    expect(stub.requests[0].headers.authorization).toBeUndefined();
  });

  it("accepts http as well as https", async () => {
    stub = stubFetch({ "r.jina.ai": "md" });
    const { output } = await read({ url: "http://localhost:3000" });

    expect(output).toBe("md");
  });
});

describe("web_read — truncation", () => {
  it("marks a page truncated past the limit", async () => {
    stub = stubFetch({ "r.jina.ai": "x".repeat(100) });
    const { output } = await read({ url: "https://example.com", maxChars: 50 });

    expect(output).toContain("x".repeat(50));
    expect(output).toContain("…(truncated)");
  });

  it("does not mark a page that fits", async () => {
    stub = stubFetch({ "r.jina.ai": "short" });
    const { output } = await read({ url: "https://example.com", maxChars: 50 });

    expect(output).toBe("short");
    expect(output).not.toContain("truncated");
  });

  it("does not mark a page exactly at the limit", async () => {
    stub = stubFetch({ "r.jina.ai": "y".repeat(10) });
    const { output } = await read({ url: "https://example.com", maxChars: 10 });

    // Off-by-one here would tell the agent content was lost when none was.
    expect(output).not.toContain("truncated");
  });
});

describe("web_read — rejected inputs", () => {
  it("rejects a malformed url before making a request", async () => {
    // No stub: reaching fetch at all would be an unrouted crash.
    const { output } = await read({ url: "not a url" });

    expect(output).toContain("web_read failed");
    expect(output).toContain("invalid url");
  });

  it.each(["file:///etc/passwd", "ftp://x.test/a", "data:text/plain,hi"])(
    "rejects the non-http scheme %s",
    async (url) => {
      const { output } = await read({ url });

      // Scheme restriction is a boundary, not a nicety: file:// would turn a
      // page reader into a local file read.
      expect(output).toContain("http(s) urls only");
    },
  );

  it("reports the status when the reader fails", async () => {
    stub = stubFetch({ "r.jina.ai": { status: 451, body: "blocked" } });
    const { output } = await read({ url: "https://example.com" });

    expect(output).toContain("web_read failed");
    expect(output).toContain("451");
  });
});
