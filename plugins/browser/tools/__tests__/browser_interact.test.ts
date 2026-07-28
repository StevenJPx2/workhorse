import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_interact from "../browser_interact";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_interact — help", () => {
  it("returns documentation and executes nothing", async () => {
    const { output, sandbox } = await runTool(browser_interact, { help: true }, ok);

    expect(output).toContain("ELEMENT ACTIONS");
    expect(output).toContain("KEY ACTION");
    expect(output).toContain("SCROLL ACTION");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});

describe("browser_interact — element actions", () => {
  it.each(["click", "dblclick", "hover", "check", "uncheck"] as const)(
    "sends %s with the selector alone",
    async (action) => {
      const { sandbox } = await runTool(browser_interact, { action, selector: "@e1", value: "ignored" }, ok);
      expect(sandbox.lastCommand()).toMatch(new RegExp(`'${action}' '@e1'$`));
    },
  );

  it("accepts a CSS selector as well as an @ref", async () => {
    const { sandbox } = await runTool(browser_interact, { action: "click", selector: "button.submit" }, ok);
    expect(sandbox.lastCommand()).toContain("'click' 'button.submit'");
  });

  it("requires a selector", async () => {
    const { output, sandbox } = await runTool(browser_interact, { action: "click" }, ok);
    expect(output).toContain("needs a selector");
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("reports the resulting URL when the action navigated", async () => {
    const { output } = await runTool(
      browser_interact,
      { action: "click", selector: "@e1" },
      { sandbox: { defaultExec: '{"data":{"url":"https://x.test/next"}}' } },
    );
    expect(output).toBe("click @e1 → https://x.test/next");
  });

  it("propagates a stale-ref failure as a throw", async () => {
    await expect(
      runTool(
        browser_interact,
        { action: "click", selector: "@e99" },
        { sandbox: { defaultExec: { exitCode: 1, stderr: "ref not found" } } },
      ),
    ).rejects.toThrow(/ref not found/);
  });
});

describe("browser_interact — value actions", () => {
  it.each(["fill", "type", "select"] as const)("sends %s with the value as a third argument", async (action) => {
    const { sandbox } = await runTool(browser_interact, { action, selector: "@e2", value: "hello" }, ok);
    expect(sandbox.lastCommand()).toContain(`'${action}' '@e2' 'hello'`);
  });

  it("sends an EMPTY value — clearing a field must not be dropped as falsy", async () => {
    const { sandbox } = await runTool(browser_interact, { action: "fill", selector: "@e2", value: "" }, ok);
    expect(sandbox.lastCommand()).toContain("'fill' '@e2' ''");
  });

  it.each(["fill", "type", "select"] as const)("refuses %s without a value", async (action) => {
    const { output, sandbox } = await runTool(browser_interact, { action, selector: "@e1" }, ok);

    expect(output).toContain(`"${action}" needs a value`);
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("escapes a value containing quotes", async () => {
    const { sandbox } = await runTool(browser_interact, { action: "fill", selector: "@e1", value: "it's" }, ok);
    expect(sandbox.lastCommand()).toContain("'it'\\''s'");
  });
});

describe("browser_interact — press", () => {
  it("sends the key as press's only argument, never a selector", async () => {
    const { sandbox } = await runTool(browser_interact, { action: "press", key: "Enter" }, ok);

    expect(sandbox.lastCommand()).toMatch(/'press' 'Enter'$/);
    expect(sandbox.lastCommand()).not.toContain("@e");
  });

  it.each(["Enter", "Tab", "Escape", "ArrowDown", "PageUp", "F5", "Control+a", "Shift+Tab"])(
    "passes %s through unchanged",
    async (key) => {
      const { sandbox } = await runTool(browser_interact, { action: "press", key }, ok);
      expect(sandbox.lastCommand()).toContain(`'press' '${key}'`);
    },
  );

  it("requires a key", async () => {
    const { output, sandbox } = await runTool(browser_interact, { action: "press" }, ok);
    expect(output).toContain("needs a key");
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("reports the resulting URL when the key navigated", async () => {
    const { output } = await runTool(
      browser_interact,
      { action: "press", key: "Enter" },
      { sandbox: { defaultExec: '{"data":{"url":"https://x.test/results"}}' } },
    );
    expect(output).toBe("press Enter → https://x.test/results");
  });
});

describe("browser_interact — scroll", () => {
  it.each(["up", "down", "left", "right"] as const)("sends %s as the first positional", async (direction) => {
    const { sandbox } = await runTool(browser_interact, { action: "scroll", direction }, ok);
    expect(sandbox.lastCommand()).toMatch(new RegExp(`'scroll' '${direction}'$`));
  });

  it("appends the pixel amount as the second positional", async () => {
    const { sandbox } = await runTool(browser_interact, { action: "scroll", direction: "down", amount: 500 }, ok);
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'down' '500'$/);
  });

  it("passes a container selector as the -s OPTION, never a positional", async () => {
    const { sandbox } = await runTool(
      browser_interact,
      { action: "scroll", direction: "down", selector: "@e4" },
      ok,
    );
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'down' '-s' '@e4'$/);
  });

  it("orders direction, amount, then -s selector", async () => {
    const { sandbox } = await runTool(
      browser_interact,
      { action: "scroll", direction: "up", amount: 200, selector: ".list" },
      ok,
    );
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'up' '200' '-s' '\.list'$/);
  });

  it("rounds a fraction and floors zero to 1 pixel", async () => {
    const frac = await runTool(browser_interact, { action: "scroll", direction: "down", amount: 199.7 }, ok);
    expect(frac.sandbox.lastCommand()).toContain("'200'");

    const zero = await runTool(browser_interact, { action: "scroll", direction: "down", amount: 0 }, ok);
    expect(zero.sandbox.lastCommand()).toContain("'1'");
  });

  it("requires a direction", async () => {
    const { output, sandbox } = await runTool(browser_interact, { action: "scroll" }, ok);
    expect(output).toContain("needs a direction");
    expect(sandbox.execCalls).toHaveLength(0);
  });

  it("describes the scroll in its output", async () => {
    const page = await runTool(browser_interact, { action: "scroll", direction: "down", amount: 300 }, ok);
    expect(page.output).toBe("scroll down by 300px");

    const container = await runTool(
      browser_interact,
      { action: "scroll", direction: "down", selector: "@e4" },
      ok,
    );
    expect(container.output).toBe("scroll down in @e4");
  });
});
