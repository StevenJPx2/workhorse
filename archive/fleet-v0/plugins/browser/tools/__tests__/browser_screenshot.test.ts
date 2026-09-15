import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_screenshot from "../browser_screenshot";

/** Screenshot succeeds; the size probe reports a fixed byte count. */
const ok = (bytes = 2048) => ({
  sandbox: {
    exec: {
      "wc -c": String(bytes),
      screenshot: "{}",
      "mkdir -p": "",
    },
  },
});

describe("browser_screenshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("writes to a timestamped temp path by default", async () => {
    const { output } = await runTool(browser_screenshot, {}, ok());
    expect(output).toContain(`/tmp/whshot-${Date.parse("2026-01-01T00:00:00Z")}.png`);
  });

  it("honors an explicit savePath", async () => {
    const { output } = await runTool(browser_screenshot, { savePath: "/out/shot.png" }, ok());
    expect(output).toContain("/out/shot.png");
  });

  it("creates the parent directory before shooting", async () => {
    const { sandbox } = await runTool(browser_screenshot, { savePath: "/deep/nested/shot.png" }, ok());
    expect(sandbox.execCalls[0].command).toBe("mkdir -p '/deep/nested'");
  });

  it("falls back to /tmp for a bare filename with no directory", async () => {
    // dirOf() now handles this: no slash means there is no directory to make.
    const { sandbox } = await runTool(browser_screenshot, { savePath: "shot.png" }, ok());
    expect(sandbox.execCalls[0].command).toBe("mkdir -p '/tmp'");
  });

  it("falls back to /tmp for a path at the filesystem root", async () => {
    const { sandbox } = await runTool(browser_screenshot, { savePath: "/shot.png" }, ok());
    expect(sandbox.execCalls[0].command).toBe("mkdir -p '/tmp'");
  });

  it("omits --full for a viewport shot", async () => {
    const { sandbox } = await runTool(browser_screenshot, { savePath: "/tmp/a.png" }, ok());
    expect(sandbox.ranCommandContaining("--full")).toBe(false);
  });

  it("adds --full before the path for a full-page shot", async () => {
    const { sandbox } = await runTool(browser_screenshot, { savePath: "/tmp/a.png", fullPage: true }, ok());
    expect(sandbox.execCalls.find((c) => c.command.includes("screenshot"))?.command).toContain(
      "'screenshot' '--full' '/tmp/a.png'",
    );
  });

  it("reports the size in KiB", async () => {
    const { output } = await runTool(browser_screenshot, { savePath: "/tmp/a.png" }, ok(4096));
    expect(output).toContain("(4 KiB)");
  });

  it("rounds the size to the nearest KiB", async () => {
    const { output } = await runTool(browser_screenshot, { savePath: "/tmp/a.png" }, ok(1600));
    expect(output).toContain("(2 KiB)");
  });

  it("reports 0 KiB when the size probe yields nothing", async () => {
    const { output } = await runTool(
      browser_screenshot,
      { savePath: "/tmp/a.png" },
      { sandbox: { exec: { "wc -c": "", screenshot: "{}", "mkdir -p": "" } } },
    );
    expect(output).toContain("(0 KiB)");
  });

  it("probes size with wc -c, not stat — stat's size flag is not portable", async () => {
    // GNU stat uses -c %s, BSD uses -f %z; `stat -c` returns nothing on macOS,
    // which reported every screenshot as 0 KiB. Caught by the contract suite.
    const { sandbox } = await runTool(browser_screenshot, { savePath: "/tmp/a.png" }, ok());
    expect(sandbox.ranCommandContaining("wc -c")).toBe(true);
    expect(sandbox.ranCommandContaining("stat -c")).toBe(false);
  });

  it("points the agent at upload_image for a hosted URL", async () => {
    const { output } = await runTool(browser_screenshot, { savePath: "/tmp/a.png" }, ok());
    expect(output).toContain("upload_image");
  });

  it("quotes a path containing spaces", async () => {
    const { sandbox } = await runTool(browser_screenshot, { savePath: "/tmp/my shot.png" }, ok());
    expect(sandbox.ranCommandContaining("'/tmp/my shot.png'")).toBe(true);
  });

  it("propagates a capture failure as a throw", async () => {
    await expect(
      runTool(
        browser_screenshot,
        { savePath: "/tmp/a.png" },
        { sandbox: { exec: { "mkdir -p": "", screenshot: { exitCode: 1, stderr: "no page" } } } },
      ),
    ).rejects.toThrow(/no page/);
  });
});
