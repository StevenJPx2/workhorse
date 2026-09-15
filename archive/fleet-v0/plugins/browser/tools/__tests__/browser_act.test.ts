import { describe, expect, it } from "vitest";
import { buildTool, runTool } from "@workhorse/test-utils/tools";
import browser_act from "../browser_act";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_act", () => {
  it("sends the action as the subcommand and the selector as its argument", async () => {
    const { sandbox } = await runTool(browser_act, { action: "click", selector: "@e1" }, ok);
    expect(sandbox.lastCommand()).toContain("'click' '@e1'");
  });

  it.each(["click", "dblclick", "hover", "check", "uncheck"] as const)(
    "sends %s with the selector alone — a stray arg would be an unexpected positional",
    async (action) => {
      const { sandbox } = await runTool(browser_act, { action, selector: "@e1", value: "ignored" }, ok);
      expect(sandbox.lastCommand()).toMatch(new RegExp(`'${action}' '@e1'$`));
    },
  );

  it.each(["fill", "type", "select"] as const)("sends %s with the value as a third argument", async (action) => {
    const { sandbox } = await runTool(browser_act, { action, selector: "@e2", value: "hello" }, ok);
    expect(sandbox.lastCommand()).toContain(`'${action}' '@e2' 'hello'`);
  });

  it("sends an EMPTY value — clearing a field must not be dropped as falsy", async () => {
    const { sandbox } = await runTool(browser_act, { action: "fill", selector: "@e2", value: "" }, ok);
    expect(sandbox.lastCommand()).toContain("'fill' '@e2' ''");
  });

  it.each(["fill", "type", "select"] as const)("refuses %s without a value instead of running it", async (action) => {
    const { output, sandbox } = await runTool(browser_act, { action, selector: "@e1" }, ok);

    expect(output).toContain(`"${action}" needs a value`);
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("does not admit press or scroll — their CLI forms are not selector-first", async () => {
    // The schema is the gate that keeps these out: `press <key>` and
    // `scroll <direction>` would have received the element ref positionally.
    // They live in browser_key / browser_scroll instead.
    const { definition } = buildTool(browser_act);
    const options = (definition.input as { entries: { action: { options: string[] } } }).entries.action.options;

    expect(options).not.toContain("press");
    expect(options).not.toContain("scroll");
    expect(options).toEqual(["click", "dblclick", "fill", "type", "hover", "select", "check", "uncheck"]);
  });

  it("reports the resulting URL when the action navigated", async () => {
    const { output } = await runTool(
      browser_act,
      { action: "click", selector: "@e1" },
      { sandbox: { defaultExec: '{"url":"https://x.test/next"}' } },
    );
    expect(output).toBe("click @e1 → https://x.test/next");
  });

  it("reports action and selector alone when no navigation occurred", async () => {
    const { output } = await runTool(browser_act, { action: "check", selector: "@e3" }, ok);
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
    const { output } = await runTool(browser_act, { action: "click", selector: "@e9" }, { sandbox: { defaultExec: "" } });
    expect(output).toBe("click @e9");
  });

  it("escapes a value containing quotes", async () => {
    const { sandbox } = await runTool(browser_act, { action: "fill", selector: "@e1", value: "it's" }, ok);
    expect(sandbox.lastCommand()).toContain("'it'\\''s'");
  });

  it("accepts a CSS selector as well as an @ref", async () => {
    const { sandbox } = await runTool(browser_act, { action: "click", selector: "button.submit" }, ok);
    expect(sandbox.lastCommand()).toContain("'click' 'button.submit'");
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
