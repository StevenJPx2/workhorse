import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser from "../browser";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser — help", () => {
  it("returns documentation and executes nothing", async () => {
    const { output, sandbox } = await runTool(browser, { help: true }, ok);

    expect(output).toContain("ACTIONS");
    expect(output).toContain("open");
    expect(output).toContain("snapshot");
    expect(output).toContain("EXAMPLES");
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("runs the action normally when help is false", async () => {
    const { sandbox } = await runTool(browser, { action: "snapshot", help: false }, ok);
    expect(sandbox.execCalls).toHaveLength(1);
  });
});

describe("browser — open", () => {
  it("issues a bare open when no wait is requested", async () => {
    const { sandbox } = await runTool(browser, { action: "open", url: "https://example.com" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'open' 'https:\/\/example\.com'$/);
  });

  it("never passes --wait to open — that flag does not exist", async () => {
    const { sandbox } = await runTool(browser, { action: "open", url: "https://x.test", waitMs: 2000 }, ok);
    expect(sandbox.lastCommand()).not.toContain("--wait");
  });

  it("expresses a settle delay as a batched wait command, in one exec", async () => {
    const { sandbox } = await runTool(browser, { action: "open", url: "https://x.test", waitMs: 2000 }, ok);

    expect(sandbox.lastCommand()).toContain("'batch' '--bail' 'open https://x.test' 'wait 2000'");
    expect(sandbox.execCalls).toHaveLength(1);
  });

  it("caps the settle wait at 8000ms", async () => {
    const { sandbox } = await runTool(browser, { action: "open", url: "https://x.test", waitMs: 60_000 }, ok);
    expect(sandbox.lastCommand()).toContain("'wait 8000'");
  });

  it("skips the wait for zero or negative", async () => {
    for (const waitMs of [0, -5]) {
      const { sandbox } = await runTool(browser, { action: "open", url: "https://x.test", waitMs }, ok);
      expect(sandbox.lastCommand()).toMatch(/'open' 'https:\/\/x\.test'$/);
    }
  });

  it("waits for a load state with --load", async () => {
    const { sandbox } = await runTool(
      browser,
      { action: "open", url: "https://x.test", waitFor: "networkidle" },
      ok,
    );
    expect(sandbox.lastCommand()).toContain("'wait --load networkidle'");
  });

  it("prefers a load state over a fixed delay", async () => {
    const { sandbox } = await runTool(
      browser,
      { action: "open", url: "https://x.test", waitMs: 3000, waitFor: "domcontentloaded" },
      ok,
    );
    expect(sandbox.lastCommand()).toContain("'wait --load domcontentloaded'");
    expect(sandbox.lastCommand()).not.toContain("wait 3000");
  });

  it("uses --bail so a failed navigation does not proceed to the wait", async () => {
    const { sandbox } = await runTool(browser, { action: "open", url: "https://x.test", waitMs: 500 }, ok);
    expect(sandbox.lastCommand()).toContain("--bail");
  });

  it("reports the landed URL from the data envelope", async () => {
    const { output } = await runTool(
      browser,
      { action: "open", url: "http://example.com" },
      { sandbox: { defaultExec: '{"success":true,"data":{"url":"https://example.com/home"}}' } },
    );
    expect(output).toBe("Browser open: https://example.com/home");
  });

  it("reports the landed URL from a batch result array", async () => {
    const { output } = await runTool(
      browser,
      { action: "open", url: "http://example.com", waitMs: 500 },
      {
        sandbox: {
          defaultExec: JSON.stringify([
            { command: ["open", "http://example.com"], result: { url: "https://example.com/final" }, success: true },
            { command: ["wait", "500"], result: {}, success: true },
          ]),
        },
      },
    );
    expect(output).toBe("Browser open: https://example.com/final");
  });

  it("requires a url", async () => {
    const { output, sandbox } = await runTool(browser, { action: "open" }, ok);
    expect(output).toContain("needs a url");
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("propagates a navigation failure as a throw", async () => {
    await expect(
      runTool(
        browser,
        { action: "open", url: "https://x.test" },
        { sandbox: { defaultExec: { exitCode: 1, stderr: "dns failure" } } },
      ),
    ).rejects.toThrow(/dns failure/);
  });
});

describe("browser — snapshot", () => {
  it("defaults to interactive-only, compact, depth 10", async () => {
    const { sandbox } = await runTool(browser, { action: "snapshot" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'snapshot' '-i' '-c' '-d' '10'$/);
  });

  it("honors a custom depth", async () => {
    const { sandbox } = await runTool(browser, { action: "snapshot", depth: 3 }, ok);
    expect(sandbox.lastCommand()).toContain("'-d' '3'");
  });

  it("drops -c when compact is disabled", async () => {
    const { sandbox } = await runTool(browser, { action: "snapshot", compact: false }, ok);
    expect(sandbox.lastCommand()).not.toContain("'-c'");
  });

  it("drops -i when full content is requested", async () => {
    const { sandbox } = await runTool(browser, { action: "snapshot", interactiveOnly: false }, ok);
    expect(sandbox.lastCommand()).not.toContain("'-i'");
  });

  it("adds -u for link hrefs and -s for a scope", async () => {
    const { sandbox } = await runTool(browser, { action: "snapshot", urls: true, selector: "#main" }, ok);
    expect(sandbox.lastCommand()).toContain("'-u'");
    expect(sandbox.lastCommand()).toContain("'-s' '#main'");
  });

  it("floors a zero depth to 1 and rounds a fraction", async () => {
    const zero = await runTool(browser, { action: "snapshot", depth: 0 }, ok);
    expect(zero.sandbox.lastCommand()).toContain("'-d' '1'");

    const frac = await runTool(browser, { action: "snapshot", depth: 4.6 }, ok);
    expect(frac.sandbox.lastCommand()).toContain("'-d' '5'");
  });

  it("unwraps the snapshot from the data envelope", async () => {
    const { output } = await runTool(
      browser,
      { action: "snapshot" },
      { sandbox: { defaultExec: '{"success":true,"data":{"snapshot":"@e1 button Submit"}}' } },
    );
    expect(output).toBe("@e1 button Submit");
  });

  it("returns raw output when the response is not JSON", async () => {
    const { output } = await runTool(
      browser,
      { action: "snapshot" },
      { sandbox: { defaultExec: "- button [ref=e1]" } },
    );
    expect(output).toBe("- button [ref=e1]");
  });
});

describe("browser — read", () => {
  it("reads the active tab when no URL is given", async () => {
    const { sandbox } = await runTool(browser, { action: "read" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'read'$/);
  });

  it("navigates and reads in one call with a URL, then --filter", async () => {
    const { sandbox } = await runTool(
      browser,
      { action: "read", url: "https://x.test", filter: "article" },
      ok,
    );
    expect(sandbox.lastCommand()).toContain("'read' 'https://x.test' '--filter' 'article'");
  });

  it("unwraps page text from data.content — not the envelope", async () => {
    const { output } = await runTool(
      browser,
      { action: "read" },
      { sandbox: { defaultExec: '{"success":true,"data":{"content":"# Title","contentType":"text/markdown"}}' } },
    );
    expect(output).toBe("# Title");
  });

  it("falls back to data.text when content is absent", async () => {
    const { output } = await runTool(
      browser,
      { action: "read" },
      { sandbox: { defaultExec: '{"data":{"text":"plain"}}' } },
    );
    expect(output).toBe("plain");
  });

  it("returns raw output when the response is not JSON", async () => {
    const { output } = await runTool(browser, { action: "read" }, { sandbox: { defaultExec: "just text" } });
    expect(output).toBe("just text");
  });
});

describe("browser — screenshot", () => {
  const shot = (bytes = 2048) => ({
    sandbox: { exec: { "wc -c": String(bytes), screenshot: "{}", "mkdir -p": "" } },
  });

  it("creates the parent directory before shooting", async () => {
    const { sandbox } = await runTool(
      browser,
      { action: "screenshot", savePath: "/deep/nested/shot.png" },
      shot(),
    );
    expect(sandbox.execCalls[0].command).toBe("mkdir -p '/deep/nested'");
  });

  it("falls back to /tmp when the path has no directory", async () => {
    const { sandbox } = await runTool(browser, { action: "screenshot", savePath: "shot.png" }, shot());
    expect(sandbox.execCalls[0].command).toBe("mkdir -p '/tmp'");
  });

  it("adds --full before the path for a full-page shot", async () => {
    const { sandbox } = await runTool(
      browser,
      { action: "screenshot", savePath: "/tmp/a.png", fullPage: true },
      shot(),
    );
    expect(sandbox.execCalls.find((c) => c.command.includes("screenshot"))?.command).toContain(
      "'screenshot' '--full' '/tmp/a.png'",
    );
  });

  it("probes size with wc -c, not stat — stat's size flag is not portable", async () => {
    const { sandbox } = await runTool(browser, { action: "screenshot", savePath: "/tmp/a.png" }, shot());
    expect(sandbox.ranCommandContaining("wc -c")).toBe(true);
    expect(sandbox.ranCommandContaining("stat -c")).toBe(false);
  });

  it("reports the size in KiB, rounded", async () => {
    const exact = await runTool(browser, { action: "screenshot", savePath: "/tmp/a.png" }, shot(4096));
    expect(exact.output).toContain("(4 KiB)");

    const rounded = await runTool(browser, { action: "screenshot", savePath: "/tmp/a.png" }, shot(1600));
    expect(rounded.output).toContain("(2 KiB)");
  });

  it("trusts the path the CLI reports over the requested one", async () => {
    const { output } = await runTool(
      browser,
      { action: "screenshot", savePath: "/tmp/a.png" },
      {
        sandbox: {
          exec: { "mkdir -p": "", screenshot: '{"data":{"path":"/tmp/a-1.png"}}', "wc -c": "2048" },
        },
      },
    );
    expect(output).toContain("/tmp/a-1.png");
  });

  it("points the agent at upload_image", async () => {
    const { output } = await runTool(browser, { action: "screenshot", savePath: "/tmp/a.png" }, shot());
    expect(output).toContain("upload_image");
  });
});

describe("browser — record", () => {
  it("requires a savePath", async () => {
    const { output, sandbox } = await runTool(browser, { action: "record" }, ok);
    expect(output).toContain("needs a savePath");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});
