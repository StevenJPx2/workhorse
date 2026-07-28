import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_key from "../browser_key";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_key", () => {
  it("sends the key as press's only argument", async () => {
    const { sandbox } = await runTool(browser_key, { key: "Enter" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'press' 'Enter'$/);
  });

  it.each(["Enter", "Tab", "Escape", "Backspace", "Delete", "Space", "ArrowDown", "PageUp", "F5"])(
    "passes the special key %s through unchanged",
    async (key) => {
      const { sandbox } = await runTool(browser_key, { key }, ok);
      expect(sandbox.lastCommand()).toContain(`'press' '${key}'`);
    },
  );

  it("passes a modifier combination through as one argument", async () => {
    const { sandbox } = await runTool(browser_key, { key: "Control+a" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'press' 'Control\+a'$/);
  });

  it("never sends a selector — that was the bug this tool exists to fix", async () => {
    const { sandbox } = await runTool(browser_key, { key: "Enter" }, ok);
    expect(sandbox.lastCommand()).not.toContain("@e");
  });

  it("reports the resulting URL when the key triggered navigation", async () => {
    const { output } = await runTool(
      browser_key,
      { key: "Enter" },
      { sandbox: { defaultExec: '{"url":"https://x.test/results"}' } },
    );
    expect(output).toBe("press Enter → https://x.test/results");
  });

  it("reports the key alone when nothing navigated", async () => {
    const { output } = await runTool(browser_key, { key: "Tab" }, ok);
    expect(output).toBe("press Tab");
  });

  it("returns trimmed raw output when the response is not JSON", async () => {
    const { output } = await runTool(browser_key, { key: "Enter" }, { sandbox: { defaultExec: " pressed " } });
    expect(output).toBe("pressed");
  });

  it("falls back to a summary when the response is empty", async () => {
    const { output } = await runTool(browser_key, { key: "Escape" }, { sandbox: { defaultExec: "" } });
    expect(output).toBe("press Escape");
  });

  it("propagates a failure as a throw", async () => {
    await expect(
      runTool(browser_key, { key: "Enter" }, { sandbox: { defaultExec: { exitCode: 1, stderr: "no focused element" } } }),
    ).rejects.toThrow(/no focused element/);
  });
});
