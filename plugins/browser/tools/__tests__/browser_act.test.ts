import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_act from "../browser_act";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_act", () => {
  it("sends the action as the subcommand and the ref as its argument", async () => {
    const { sandbox } = await runTool(browser_act, { action: "click", selector: "@e1" }, ok);
    expect(sandbox.lastCommand()).toContain("'click' '@e1'");
  });

  it("appends the value for a fill", async () => {
    const { sandbox } = await runTool(browser_act, { action: "fill", selector: "@e2", value: "hello" }, ok);
    expect(sandbox.lastCommand()).toContain("'fill' '@e2' 'hello'");
  });

  it("sends an EMPTY value — clearing a field must not be dropped as falsy", async () => {
    const { sandbox } = await runTool(browser_act, { action: "fill", selector: "@e2", value: "" }, ok);
    expect(sandbox.lastCommand()).toContain("'fill' '@e2' ''");
  });

  it("omits the value argument when undefined", async () => {
    const { sandbox } = await runTool(browser_act, { action: "click", selector: "@e1" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'click' '@e1'$/);
  });

  it.each(["click", "dblclick", "fill", "type", "press", "hover", "scroll", "select", "check", "uncheck"] as const)(
    "supports the %s action",
    async (action) => {
      const { sandbox } = await runTool(browser_act, { action, selector: "@e1" }, ok);
      expect(sandbox.lastCommand()).toContain(`'${action}' '@e1'`);
    },
  );

  it("reports the resulting URL when the action navigated", async () => {
    const { output } = await runTool(
      browser_act,
      { action: "click", selector: "@e1" },
      { sandbox: { defaultExec: '{"url":"https://x.test/next"}' } },
    );
    expect(output).toBe("click @e1 → https://x.test/next");
  });

  it("reports action and ref alone when no navigation occurred", async () => {
    const { output } = await runTool(browser_act, { action: "check", selector: "@e3" }, { sandbox: { defaultExec: "{}" } });
    expect(output).toBe("check @e3");
  });

  it("returns trimmed raw output when the response is not JSON", async () => {
    const { output } = await runTool(
      browser_act,
      { action: "click", selector: "@e1" },
      { sandbox: { defaultExec: "  done  " } },
    );
    expect(output).toBe("done");
  });

  it("falls back to an action summary when the response is empty", async () => {
    const { output } = await runTool(browser_act, { action: "scroll", selector: "@e9" }, { sandbox: { defaultExec: "" } });
    expect(output).toBe("scroll @e9");
  });

  it("escapes a value containing quotes", async () => {
    const { sandbox } = await runTool(browser_act, { action: "fill", selector: "@e1", value: "it's" }, ok);
    expect(sandbox.lastCommand()).toContain("'it'\\''s'");
  });

  it("propagates a stale-ref failure as a throw", async () => {
    await expect(
      runTool(
        browser_act,
        { action: "click", selector: "@e99" },
        { sandbox: { defaultExec: { exitCode: 1, stderr: "ref not found" } } },
      ),
    ).rejects.toThrow(/ref not found/);
  });
});
