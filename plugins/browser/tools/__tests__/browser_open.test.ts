import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_open from "../browser_open";

describe("browser_open", () => {
  it("issues an open command with the URL", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://example.com" }, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toContain("'open' 'https://example.com'");
  });

  it("omits --wait when waitMs is absent", async () => {
    const { sandbox } = await runTool(browser_open, { url: "https://x.test" }, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).not.toContain("--wait");
  });

  it("passes --wait through when positive", async () => {
    const { sandbox } = await runTool(
      browser_open,
      { url: "https://x.test", waitMs: 2000 },
      { sandbox: { defaultExec: "{}" } },
    );
    expect(sandbox.lastCommand()).toContain("'--wait' '2000'");
  });

  it("caps the wait at 8000ms", async () => {
    const { sandbox } = await runTool(
      browser_open,
      { url: "https://x.test", waitMs: 60_000 },
      { sandbox: { defaultExec: "{}" } },
    );
    expect(sandbox.lastCommand()).toContain("'--wait' '8000'");
  });

  it("omits --wait for zero", async () => {
    const { sandbox } = await runTool(
      browser_open,
      { url: "https://x.test", waitMs: 0 },
      { sandbox: { defaultExec: "{}" } },
    );
    expect(sandbox.lastCommand()).not.toContain("--wait");
  });

  it("omits --wait for a negative value", async () => {
    const { sandbox } = await runTool(
      browser_open,
      { url: "https://x.test", waitMs: -5 },
      { sandbox: { defaultExec: "{}" } },
    );
    expect(sandbox.lastCommand()).not.toContain("--wait");
  });

  it("reports the URL the browser actually landed on (redirects)", async () => {
    const { output } = await runTool(
      browser_open,
      { url: "http://example.com" },
      { sandbox: { defaultExec: '{"url":"https://example.com/home"}' } },
    );
    expect(output).toBe("Browser open: https://example.com/home");
  });

  it("falls back to the requested URL when the JSON lacks one", async () => {
    const { output } = await runTool(
      browser_open,
      { url: "https://x.test" },
      { sandbox: { defaultExec: '{"ok":true}' } },
    );
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

  it("propagates a daemon failure as a throw", async () => {
    await expect(
      runTool(browser_open, { url: "https://x.test" }, { sandbox: { defaultExec: { exitCode: 1, stderr: "daemon down" } } }),
    ).rejects.toThrow(/daemon down/);
  });
});
