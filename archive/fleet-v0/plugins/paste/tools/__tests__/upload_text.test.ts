// upload_text walks three keyless paste hosts, each with a DIFFERENT request
// shape (raw body / multipart / urlencoded), and verifies the minted URL serves
// the content back before accepting it. All of that is fetch, so these tests
// route per-host and assert on the request the tool actually built.

import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import upload_text from "../upload_text";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

const paste = (input: Record<string, unknown>, opts = {}) => runTool(upload_text, input, opts);

/** paste.rs mints a URL on POST and serves the body back on GET. */
const pasteRsWorks = (content: string) =>
  stubFetch({
    "https://paste.rs/xyz": content,
    "https://paste.rs": (req) => (req.method === "POST" ? "https://paste.rs/xyz\n" : content),
  });

describe("upload_text — help", () => {
  it("returns documentation without a network call", async () => {
    const { output } = await paste({ help: true });

    expect(output).toContain("upload_text");
    expect(output).toContain("HOST CHAIN");
  });
});

describe("upload_text — sources", () => {
  it("hosts inline content", async () => {
    stub = pasteRsWorks("hello world");
    const { output } = await paste({ content: "hello world" });

    expect(output).toContain("Hosted via paste.rs");
    expect(output).toContain("https://paste.rs/xyz");
  });

  it("reads a file from the container when given a path", async () => {
    stub = pasteRsWorks("file body");
    const { output } = await paste({ path: "/tmp/log.txt" }, { sandbox: { files: { "/tmp/log.txt": "file body" } } });

    expect(output).toContain("https://paste.rs/xyz");
  });

  it("reports a missing file rather than hosting nothing", async () => {
    // No stub: any fetch would be an unrouted crash, proving it short-circuits.
    const { output } = await paste({ path: "/tmp/absent.txt" });

    expect(output).toContain("file not found");
  });

  it("prefers inline content over a path when both are given", async () => {
    stub = pasteRsWorks("inline wins");
    await paste({ content: "inline wins", path: "/tmp/other.txt" }, { sandbox: { files: { "/tmp/other.txt": "no" } } });

    expect(stub.requests[0].body).toBe("inline wins");
  });

  it("refuses when neither source is given", async () => {
    const { output } = await paste({});
    expect(output).toContain("pass `content` or `path`");
  });

  it.each(["", "   ", "\n\t"])("refuses whitespace-only content (%j)", async (content) => {
    const { output } = await paste({ content });

    // Hosting a blank paste wastes a URL and tells the reader nothing.
    expect(output).toContain("nothing to host");
  });
});

describe("upload_text — size limit", () => {
  it("refuses content over 1 MiB before uploading", async () => {
    const { output } = await paste({ content: "x".repeat(1024 * 1024 + 1) });

    expect(output).toContain("exceeds the 1 MiB paste limit");
  });

  it("measures BYTES, not characters — multibyte text must not slip past", async () => {
    // 400k emoji = 1.6 MB in UTF-8 but only 800k UTF-16 units.
    const { output } = await paste({ content: "😀".repeat(400_000) });

    expect(output).toContain("exceeds the 1 MiB paste limit");
  });

  it("accepts content just under the limit", async () => {
    const content = "x".repeat(1024 * 1024 - 10);
    stub = pasteRsWorks(content);
    const { output } = await paste({ content });

    expect(output).toContain("Hosted via paste.rs");
  });
});

describe("upload_text — host chain", () => {
  it("tries paste.rs first", async () => {
    stub = pasteRsWorks("body");
    await paste({ content: "body" });

    expect(stub.requests[0].url).toContain("paste.rs");
  });

  it("falls through to 0x0.st when paste.rs fails", async () => {
    stub = stubFetch({
      "https://paste.rs": { status: 503 },
      "https://0x0.st/abc": "body",
      "https://0x0.st": (req) => (req.method === "POST" ? "https://0x0.st/abc\n" : "body"),
    });

    const { output } = await paste({ content: "body" });
    expect(output).toContain("Hosted via 0x0.st");
  });

  it("falls through to dpaste.org and appends /raw", async () => {
    stub = stubFetch({
      "https://paste.rs": { status: 503 },
      "https://0x0.st": { status: 503 },
      "dpaste.org/api": '"https://dpaste.org/ABC"',
      "dpaste.org/ABC/raw": "body",
    });

    const { output } = await paste({ content: "body" });

    // Without /raw the URL serves an HTML page, so `curl <url>` would not
    // reproduce the content — which is the tool's whole promise.
    expect(output).toContain("https://dpaste.org/ABC/raw");
  });

  it("accepts paste.rs's 201 — a created status is not a failure", async () => {
    stub = stubFetch({
      "https://paste.rs/xyz": "body",
      "https://paste.rs": (req) =>
        req.method === "POST" ? { status: 201, body: "https://paste.rs/xyz\n" } : "body",
    });

    const { output } = await paste({ content: "body" });
    expect(output).toContain("Hosted via paste.rs");
  });

  it("rejects a host that MINTS a url but serves the WRONG content", async () => {
    stub = stubFetch({
      "https://paste.rs/xyz": "something else entirely",
      "https://paste.rs": "https://paste.rs/xyz\n",
      "https://0x0.st/abc": "the real body",
      "https://0x0.st": (req) => (req.method === "POST" ? "https://0x0.st/abc\n" : "the real body"),
    });

    const { output } = await paste({ content: "the real body" });
    expect(output).toContain("Hosted via 0x0.st");
  });

  it("advances past a host that returns a non-url body", async () => {
    stub = stubFetch({
      "https://paste.rs": "not a url at all",
      "https://0x0.st/abc": "body",
      "https://0x0.st": (req) => (req.method === "POST" ? "https://0x0.st/abc\n" : "body"),
    });

    const { output } = await paste({ content: "body" });
    expect(output).toContain("Hosted via 0x0.st");
  });

  it("advances past a host whose request THROWS", async () => {
    stub = stubFetch({
      "https://paste.rs": () => {
        throw new Error("connection reset");
      },
      "https://0x0.st/abc": "body",
      "https://0x0.st": (req) => (req.method === "POST" ? "https://0x0.st/abc\n" : "body"),
    });

    const { output } = await paste({ content: "body" });
    expect(output).toContain("Hosted via 0x0.st");
  });

  it("honors a host override", async () => {
    stub = stubFetch({
      "https://0x0.st/abc": "body",
      "https://0x0.st": (req) => (req.method === "POST" ? "https://0x0.st/abc\n" : "body"),
    });

    const { output } = await paste({ content: "body", hosts: ["0x0.st"] });

    expect(output).toContain("Hosted via 0x0.st");
    expect(stub.requested("paste.rs")).toBe(false);
  });

  it("names an unknown host in the failure report instead of crashing", async () => {
    const { output } = await paste({ content: "body", hosts: ["nonexistent.host"] });

    expect(output).toContain("nonexistent.host(unknown)");
  });

  it("reports every failure and forbids fabricating a url", async () => {
    stub = stubFetch({}, { fallback: { status: 500 } });
    const { output } = await paste({ content: "body" });

    expect(output).toContain("every host failed");
    expect(output).toContain("Do not fabricate");
    expect(output).toContain("paste.rs");
    expect(output).toContain("dpaste.org");
  });
});

describe("upload_text — per-host request shapes", () => {
  it("posts a RAW body to paste.rs", async () => {
    stub = pasteRsWorks("raw content");
    await paste({ content: "raw content" });

    const post = stub.requests.find((r) => r.method === "POST")!;
    expect(post.body).toBe("raw content");
  });

  it("sends a user-agent and a multipart file field to 0x0.st", async () => {
    stub = stubFetch({
      "https://paste.rs": { status: 503 },
      "https://0x0.st/abc": "body",
      "https://0x0.st": (req) => (req.method === "POST" ? "https://0x0.st/abc\n" : "body"),
    });

    await paste({ content: "body" });

    const post = stub.requests.find((r) => r.url.includes("0x0.st") && r.method === "POST")!;
    // 0x0.st rejects anonymous clients, so the UA is load-bearing.
    expect(post.headers["user-agent"]).toContain("workhorse-paste");
    expect(post.formFields).toEqual(["file"]);
  });

  it("posts urlencoded form fields to dpaste.org", async () => {
    stub = stubFetch({
      "https://paste.rs": { status: 503 },
      "https://0x0.st": { status: 503 },
      "dpaste.org/api": '"https://dpaste.org/ABC"',
      "dpaste.org/ABC/raw": "body",
    });

    await paste({ content: "body" });

    const post = stub.requests.find((r) => r.url.includes("dpaste.org/api"))!;
    expect(post.headers["content-type"]).toContain("x-www-form-urlencoded");
    expect(post.body).toContain("format=url");
    expect(post.body).toContain("expires=365");
  });

  it("strips the quotes dpaste wraps its url in", async () => {
    stub = stubFetch({
      "https://paste.rs": { status: 503 },
      "https://0x0.st": { status: 503 },
      "dpaste.org/api": '"https://dpaste.org/QUOTED"',
      "dpaste.org/QUOTED/raw": "body",
    });

    const { output } = await paste({ content: "body" });

    expect(output).toContain("https://dpaste.org/QUOTED/raw");
    expect(output).not.toContain('"');
  });
});

describe("upload_text — verification", () => {
  it("compares only the first 64 chars — hosts may add a trailing newline", async () => {
    const content = "a".repeat(200);
    stub = stubFetch({
      "https://paste.rs/xyz": `${content}\n`,
      "https://paste.rs": "https://paste.rs/xyz\n",
    });

    const { output } = await paste({ content });
    expect(output).toContain("Hosted via paste.rs");
  });

  it("tolerates leading whitespace differences", async () => {
    stub = stubFetch({
      "https://paste.rs/xyz": "  hello",
      "https://paste.rs": "https://paste.rs/xyz\n",
    });

    const { output } = await paste({ content: "hello" });
    expect(output).toContain("Hosted via paste.rs");
  });

  it("treats a non-ok verification GET as a failure", async () => {
    stub = stubFetch(
      {
        "https://paste.rs/xyz": { status: 404 },
        "https://paste.rs": "https://paste.rs/xyz\n",
      },
      { fallback: { status: 500 } },
    );

    const { output } = await paste({ content: "body" });
    expect(output).toContain("minted but served wrong/empty");
  });
});
