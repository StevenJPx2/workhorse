import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_open from "../browser_open";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_open", () => {
  it("issues a bare open when no wait is requested", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://example.com" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'open' 'https:\/\/example\.com'$/);
  });

  it("never passes --wait to open — that flag does not exist on the CLI", async () => {
    // The original bug: `open --wait <ms>` was invented. Waiting is `wait <ms>`.
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 2000 }, ok);
    expect(sandbox.lastCommand()).not.toContain("--wait");
  });

  it("expresses a settle delay as a batched wait command", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 2000 }, ok);
    expect(sandbox.lastCommand()).toContain("'batch' '--bail' 'open https://x.test' 'wait 2000'");
  });

  it("keeps a waited open to ONE container exec", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 500 }, ok);
    expect(sandbox.execCalls).toHaveLength(1);
  });

  it("caps the settle wait at 8000ms", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 60_000 }, ok);
    expect(sandbox.lastCommand()).toContain("'wait 8000'");
  });

  it("rounds a fractional wait", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 1500.6 }, ok);
    expect(sandbox.lastCommand()).toContain("'wait 1501'");
  });

  it("skips the wait for zero", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 0 }, ok);
    expect(sandbox.lastCommand()).toMatch(/'open' 'https:\/\/x\.test'$/);
  });

  it("skips the wait for a negative value", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: -5 }, ok);
    expect(sandbox.lastCommand()).toMatch(/'open' 'https:\/\/x\.test'$/);
  });

  it("waits for a load state with --load", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitFor: "networkidle" }, ok);
    expect(sandbox.lastCommand()).toContain("'wait --load networkidle'");
  });

  it("prefers a load state over a fixed delay when both are given", async () => {
    const { sandbox } = await runTool(
      browser_open,
      { url: "https://x.test", waitMs: 3000, waitFor: "domcontentloaded" },
      ok,
    );
    expect(sandbox.lastCommand()).toContain("'wait --load domcontentloaded'");
    expect(sandbox.lastCommand()).not.toContain("wait 3000");
  });

  it("uses --bail so a failed navigation does not silently proceed to the wait", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test", waitMs: 500 }, ok);
    expect(sandbox.lastCommand()).toContain("--bail");
  });

  it("reports the URL the browser actually landed on (redirects)", async () => {
    const { output } = await runTool(
      browser_open,
      { url: "http://example.com" },
      { sandbox: { defaultExec: '{"url":"https://example.com/home"}' } },
    );
    expect(output).toBe("Browser open: https://example.com/home");
  });

  it("reads the landed URL out of a nested data envelope", async () => {
    const { output } = await runTool(
      browser_open,
      { url: "http://example.com" },
      { sandbox: { defaultExec: '{"success":true,"data":{"url":"https://example.com/x"}}' } },
    );
    expect(output).toBe("Browser open: https://example.com/x");
  });

  it("reads the landed URL out of a batch result array", async () => {
    // batch --json shape: [{ command, result, error, success }, ...]
    const { output } = await runTool(
      browser_open,
      { url: "http://example.com", waitMs: 500 },
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

  it("falls back to the requested URL when the response carries none", async () => {
    const { output } = await runTool(browser_open, { url: "https://x.test" }, { sandbox: { defaultExec: '{"ok":true}' } });
    expect(output).toBe("Browser open: https://x.test");
  });

  it("returns trimmed raw output when the response is not JSON", async () => {
    const { output } = await runTool(
      browser_open,
      { url: "https://x.test" },
      { sandbox: { defaultExec: "  navigated ok  " } },
    );
    expect(output).toBe("navigated ok");
  });

  it("reports a generic success when the response is empty", async () => {
    const { output } = await runTool(browser_open, { url: "https://x.test" }, { sandbox: { defaultExec: "" } });
    expect(output).toBe("Opened https://x.test");
  });

  it("propagates a navigation failure as a throw", async () => {
    await expect(
      runTool(browser_open, { url: "https://x.test" }, { sandbox: { defaultExec: { exitCode: 1, stderr: "dns failure" } } }),
    ).rejects.toThrow(/dns failure/);
  });
});
