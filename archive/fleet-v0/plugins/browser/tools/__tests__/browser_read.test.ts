import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_read from "../browser_read";

describe("browser_read", () => {
  it("reads the active tab when no URL is given", async () => {
    const { sandbox } = await runTool(browser_read, {}, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toMatch(/'read'$/);
  });

  it("navigates and reads in one call when a URL is given", async () => {
    const { sandbox } = await runTool(browser_read, { url: "https://x.test" }, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toContain("'read' 'https://x.test'");
  });

  it("appends --filter when given", async () => {
    const { sandbox } = await runTool(browser_read, { filter: "main" }, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toContain("'--filter' 'main'");
  });

  it("orders url before --filter", async () => {
    const { sandbox } = await runTool(
      browser_read,
      { url: "https://x.test", filter: "article" },
      { sandbox: { defaultExec: "{}" } },
    );
    expect(sandbox.lastCommand()).toContain("'read' 'https://x.test' '--filter' 'article'");
  });

  it("prefers the content field", async () => {
    const { output } = await runTool(
      browser_read,
      {},
      { sandbox: { defaultExec: '{"content":"# Title","text":"Title"}' } },
    );
    expect(output).toBe("# Title");
  });

  it("falls back to the text field when content is absent", async () => {
    const { output } = await runTool(browser_read, {}, { sandbox: { defaultExec: '{"text":"plain text"}' } });
    expect(output).toBe("plain text");
  });

  it("returns the raw payload when neither field is present", async () => {
    const { output } = await runTool(browser_read, {}, { sandbox: { defaultExec: '{"other":1}' } });
    expect(output).toBe('{"other":1}');
  });

  it("returns raw output when the response is not JSON", async () => {
    const { output } = await runTool(browser_read, {}, { sandbox: { defaultExec: "just some text" } });
    expect(output).toBe("just some text");
  });

  it("preserves surrounding whitespace in raw output", async () => {
    // Unlike open/act, read does NOT trim — page content may be significant.
    const { output } = await runTool(browser_read, {}, { sandbox: { defaultExec: "  indented\n" } });
    expect(output).toBe("  indented\n");
  });

  it("propagates a read failure as a throw", async () => {
    await expect(
      runTool(browser_read, {}, { sandbox: { defaultExec: { exitCode: 1, stderr: "no active page" } } }),
    ).rejects.toThrow(/no active page/);
  });
});
