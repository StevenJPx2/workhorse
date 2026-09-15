// upload_image spans BOTH boundaries: it execs the imgup CLI in the container
// AND fetches the minted URL from the worker to confirm the bytes are really
// there. So these tests drive a fake sandbox and a stubbed fetch together.

import { afterEach, describe, expect, it } from "vitest";
import { runTool, stubFetch, type StubFetchHandle } from "@workhorse/test-utils/tools";
import upload_image from "../upload_image";

let stub: StubFetchHandle | undefined;

afterEach(() => {
  stub?.restore();
  stub = undefined;
});

/** A body big enough to pass the >100-byte "real image" guard. */
const IMAGE_BYTES = "P".repeat(500);

/** Sandbox where the file exists and imgup prints a URL for every host. */
const uploads = (url = "https://i.ibb.co/abc/shot.png") => ({
  sandbox: { exec: { "test -f": "yes", "/usr/local/bin/imgup": `${url}\n` } },
});

const upload = (input: Record<string, unknown>, opts = uploads()) => runTool(upload_image, input, opts);

describe("upload_image — help", () => {
  it("returns documentation without touching the container", async () => {
    const { output, sandbox } = await upload({ help: true });

    expect(output).toContain("upload_image");
    expect(output).toContain("HOST CHAIN");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});

describe("upload_image — host chain", () => {
  it("tries imgbb FIRST — the keyed host is the reliable one", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { output, sandbox } = await upload({ path: "/tmp/a.png" });

    const imgupCalls = sandbox.execCalls.filter((c) => c.command.includes("imgup"));
    expect(imgupCalls[0].command).toContain("'imgbb'");
    expect(output).toContain("via imgbb");
  });

  it("stops at the first host that verifiably serves the image", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { sandbox } = await upload({ path: "/tmp/a.png" });

    // One upload attempt only — no reason to pay for imgbox after imgbb worked.
    expect(sandbox.execCalls.filter((c) => c.command.includes("imgup"))).toHaveLength(1);
  });

  it("advances to the next host when imgup exits nonzero", async () => {
    stub = stubFetch({ "img.test": IMAGE_BYTES });
    const { output, sandbox } = await upload(
      { path: "/tmp/a.png" },
      {
        sandbox: {
          exec: {
            "test -f": "yes",
            // Host name is the discriminator — each imgup invocation carries -H '<host>'.
            "'imgbb'": { exitCode: 1, stderr: "bad key" },
            "'imgbox'": "https://img.test/x.png\n",
          },
        },
      },
    );

    expect(output).toContain("via imgbox");
    expect(sandbox.execCalls.filter((c) => c.command.includes("imgup")).length).toBeGreaterThan(1);
  });

  it("advances when a host MINTS a url but serves nothing — mint is not storage", async () => {
    stub = stubFetch({
      "i.ibb.co": { status: 404 },
      "img.test": IMAGE_BYTES,
    });

    const { output } = await upload(
      { path: "/tmp/a.png" },
      {
        sandbox: {
          exec: {
            "test -f": "yes",
            "'imgbb'": "https://i.ibb.co/dead.png\n",
            "'imgbox'": "https://img.test/x.png\n",
          },
        },
      },
    );

    expect(output).toContain("via imgbox");
  });

  it("rejects a url that serves a tiny body — an error page is not an image", async () => {
    stub = stubFetch({
      "i.ibb.co": "nope", // 4 bytes, under the >100 guard
      "img.test": IMAGE_BYTES,
    });

    const { output } = await upload(
      { path: "/tmp/a.png" },
      {
        sandbox: {
          exec: {
            "test -f": "yes",
            "'imgbb'": "https://i.ibb.co/tiny.png\n",
            "'imgbox'": "https://img.test/x.png\n",
          },
        },
      },
    );

    expect(output).toContain("via imgbox");
  });

  it("honors an explicit host override", async () => {
    stub = stubFetch({ "img.test": IMAGE_BYTES });
    const { sandbox } = await upload(
      { path: "/tmp/a.png", hosts: ["pixhost"] },
      { sandbox: { exec: { "test -f": "yes", imgup: "https://img.test/x.png\n" } } },
    );

    const imgup = sandbox.execCalls.find((c) => c.command.includes("imgup"))!;
    expect(imgup.command).toContain("'pixhost'");
  });

  it("ignores an empty hosts array and uses the default chain", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { sandbox } = await upload({ path: "/tmp/a.png", hosts: [] });

    expect(sandbox.execCalls.find((c) => c.command.includes("imgup"))!.command).toContain("'imgbb'");
  });

  it("reports every failure and tells the agent NOT to fabricate a url", async () => {
    stub = stubFetch({}, { fallback: { status: 500 } });
    const { output } = await upload({ path: "/tmp/a.png" });

    expect(output).toContain("every host failed");
    // A fabricated URL is a broken embed in a PR — worse than an honest failure.
    expect(output).toContain("Do not fabricate");
    expect(output).toContain("imgbb");
    expect(output).toContain("catbox");
  });

  it("distinguishes 'failed' from 'minted but served empty' in the report", async () => {
    stub = stubFetch({ "i.ibb.co": { status: 404 } }, { fallback: { status: 500 } });

    const { output } = await upload(
      { path: "/tmp/a.png" },
      {
        sandbox: {
          exec: {
            "test -f": "yes",
            "'imgbb'": "https://i.ibb.co/dead.png\n",
            "'imgbox'": { exitCode: 1 },
          },
        },
      },
    );

    // The distinction is diagnostic: a mint-but-empty host is misconfigured,
    // a failed exec is usually a key or a network problem.
    expect(output).toContain("imgbb(minted but served empty)");
    expect(output).toContain("imgbox(failed)");
  });
});

describe("upload_image — output formats", () => {
  it("returns the bare url by default", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { output } = await upload({ path: "/tmp/a.png" });

    expect(output).toContain("https://i.ibb.co/abc/shot.png");
    expect(output).not.toContain("![");
  });

  it("wraps in markdown with alt text", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { output } = await upload({ path: "/tmp/a.png", format: "markdown", alt: "the new flow" });

    expect(output).toContain("![the new flow](https://i.ibb.co/abc/shot.png)");
  });

  it("wraps in html with alt text", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { output } = await upload({ path: "/tmp/a.png", format: "html", alt: "shot" });

    expect(output).toContain('<img src="https://i.ibb.co/abc/shot.png" alt="shot">');
  });

  it("defaults alt to 'image'", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { output } = await upload({ path: "/tmp/a.png", format: "markdown" });

    expect(output).toContain("![image](");
  });
});

describe("upload_image — the file must exist first", () => {
  it("refuses a missing file without attempting an upload", async () => {
    const { output, sandbox } = await upload(
      { path: "/tmp/nope.png" },
      { sandbox: { exec: { "test -f": "no" } } },
    );

    expect(output).toContain("file not found");
    expect(sandbox.execCalls.some((c) => c.command.includes("imgup"))).toBe(false);
  });

  it("points the agent at how to produce one", async () => {
    const { output } = await upload({ path: "/tmp/nope.png" }, { sandbox: { exec: { "test -f": "no" } } });

    expect(output).toMatch(/browser_screenshot|browser_record/);
  });
});

describe("upload_image — shell safety", () => {
  it("escapes a quote in the path", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { sandbox } = await upload(
      { path: "/tmp/it's a shot.png" },
      { sandbox: { exec: { "test -f": "yes", imgup: "https://i.ibb.co/a.png\n" } } },
    );

    // An unescaped quote would break the command and could inject a second one.
    expect(sandbox.execCalls[0].command).toContain("'/tmp/it'\\''s a shot.png'");
  });

  it("passes plain format and disables the clipboard — there is no clipboard in a container", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { sandbox } = await upload({ path: "/tmp/a.png" });

    const imgup = sandbox.execCalls.find((c) => c.command.includes("imgup"))!.command;
    expect(imgup).toContain("-f plain");
    expect(imgup).toContain("--no-clipboard");
  });

  it("extracts the url even when imgup prints extra noise", async () => {
    stub = stubFetch({ "i.ibb.co": IMAGE_BYTES });
    const { output } = await upload(
      { path: "/tmp/a.png" },
      {
        sandbox: {
          exec: {
            "test -f": "yes",
            imgup: "Uploading...\nhttps://i.ibb.co/found.png\nDone.\n",
          },
        },
      },
    );

    expect(output).toContain("https://i.ibb.co/found.png");
  });

  it("treats output with no url as a failure", async () => {
    stub = stubFetch({}, { fallback: { status: 500 } });
    const { output } = await upload(
      { path: "/tmp/a.png" },
      { sandbox: { exec: { "test -f": "yes", imgup: "uploaded ok, no link for you\n" } } },
    );

    expect(output).toContain("every host failed");
  });

  it("survives a network error during verification", async () => {
    stub = stubFetch({
      "i.ibb.co": () => {
        throw new Error("connection reset");
      },
    });

    const { output } = await upload(
      { path: "/tmp/a.png", hosts: ["imgbb"] },
      { sandbox: { exec: { "test -f": "yes", imgup: "https://i.ibb.co/a.png\n" } } },
    );

    expect(output).toContain("every host failed");
  });
});
