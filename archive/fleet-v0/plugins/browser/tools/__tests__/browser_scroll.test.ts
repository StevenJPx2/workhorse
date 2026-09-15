import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_scroll from "../browser_scroll";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_scroll", () => {
  it.each(["up", "down", "left", "right"] as const)("sends %s as the first positional", async (direction) => {
    const { sandbox } = await runTool(browser_scroll, { direction }, ok);
    expect(sandbox.lastCommand()).toMatch(new RegExp(`'scroll' '${direction}'$`));
  });

  it("appends the pixel amount as the second positional", async () => {
    const { sandbox } = await runTool(browser_scroll, { direction: "down", amount: 500 }, ok);
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'down' '500'$/);
  });

  it("omits the amount when not given, letting the CLI default apply", async () => {
    const { sandbox } = await runTool(browser_scroll, { direction: "down" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'down'$/);
  });

  it("passes a container selector as the -s OPTION, not a positional", async () => {
    // The bug this tool fixes: a positional ref was read as the direction.
    const { sandbox } = await runTool(browser_scroll, { direction: "down", selector: "@e4" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'down' '-s' '@e4'$/);
  });

  it("orders direction, amount, then -s selector", async () => {
    const { sandbox } = await runTool(browser_scroll, { direction: "up", amount: 200, selector: ".list" }, ok);
    expect(sandbox.lastCommand()).toMatch(/'scroll' 'up' '200' '-s' '\.list'$/);
  });

  it("rounds a fractional amount", async () => {
    const { sandbox } = await runTool(browser_scroll, { direction: "down", amount: 199.7 }, ok);
    expect(sandbox.lastCommand()).toContain("'200'");
  });

  it("floors a zero or negative amount to 1 pixel", async () => {
    const { sandbox } = await runTool(browser_scroll, { direction: "down", amount: 0 }, ok);
    expect(sandbox.lastCommand()).toContain("'1'");
  });

  it("describes the scroll in its output", async () => {
    const { output } = await runTool(browser_scroll, { direction: "down", amount: 300 }, ok);
    expect(output).toBe("scroll down by 300px");
  });

  it("names the container when scrolling one", async () => {
    const { output } = await runTool(browser_scroll, { direction: "down", selector: "@e4" }, ok);
    expect(output).toBe("scroll down in @e4");
  });

  it("returns raw output when the response is not JSON", async () => {
    const { output } = await runTool(browser_scroll, { direction: "down" }, { sandbox: { defaultExec: " scrolled " } });
    expect(output).toBe("scrolled");
  });

  it("propagates a failure as a throw", async () => {
    await expect(
      runTool(browser_scroll, { direction: "down" }, { sandbox: { defaultExec: { exitCode: 1, stderr: "no page" } } }),
    ).rejects.toThrow(/no page/);
  });
});
