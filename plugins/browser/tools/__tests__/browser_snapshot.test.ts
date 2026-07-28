import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_snapshot from "../browser_snapshot";

const ok = { sandbox: { defaultExec: "{}" } };

describe("browser_snapshot", () => {
  it("defaults to interactive-only, compact, depth 10", async () => {
    const { sandbox } = await runTool(browser_snapshot, {}, ok);
    expect(sandbox.lastCommand()).toMatch(/'snapshot' '-i' '-c' '-d' '10'$/);
  });

  it("honors a custom depth — the input is no longer ignored", async () => {
    const { sandbox } = await runTool(browser_snapshot, { depth: 3 }, ok);
    expect(sandbox.lastCommand()).toContain("'-d' '3'");
    expect(sandbox.lastCommand()).not.toContain("'10'");
  });

  it("drops -c when compact is disabled", async () => {
    const { sandbox } = await runTool(browser_snapshot, { compact: false }, ok);
    expect(sandbox.lastCommand()).not.toContain("'-c'");
  });

  it("drops -i when full content is requested", async () => {
    const { sandbox } = await runTool(browser_snapshot, { interactiveOnly: false }, ok);
    expect(sandbox.lastCommand()).not.toContain("'-i'");
  });

  it("adds -u to include link hrefs", async () => {
    const { sandbox } = await runTool(browser_snapshot, { urls: true }, ok);
    expect(sandbox.lastCommand()).toContain("'-u'");
  });

  it("scopes to a selector with -s", async () => {
    const { sandbox } = await runTool(browser_snapshot, { selector: "#main" }, ok);
    expect(sandbox.lastCommand()).toContain("'-s' '#main'");
  });

  it("floors a zero depth to 1", async () => {
    const { sandbox } = await runTool(browser_snapshot, { depth: 0 }, ok);
    expect(sandbox.lastCommand()).toContain("'-d' '1'");
  });

  it("rounds a fractional depth", async () => {
    const { sandbox } = await runTool(browser_snapshot, { depth: 4.6 }, ok);
    expect(sandbox.lastCommand()).toContain("'-d' '5'");
  });

  it("combines every option in CLI order", async () => {
    const { sandbox } = await runTool(
      browser_snapshot,
      { interactiveOnly: true, compact: true, urls: true, selector: "#app", depth: 5 },
      ok,
    );
    expect(sandbox.lastCommand()).toMatch(/'snapshot' '-i' '-c' '-u' '-s' '#app' '-d' '5'$/);
  });

  it("unwraps the snapshot field", async () => {
    const { output } = await runTool(browser_snapshot, {}, { sandbox: { defaultExec: '{"snapshot":"@e1 button Submit"}' } });
    expect(output).toBe("@e1 button Submit");
  });

  it("unwraps a snapshot nested in a data envelope", async () => {
    const { output } = await runTool(
      browser_snapshot,
      {},
      { sandbox: { defaultExec: '{"success":true,"data":{"snapshot":"@e1 link Home"}}' } },
    );
    expect(output).toBe("@e1 link Home");
  });

  it("returns the raw payload when no snapshot field is present", async () => {
    const { output } = await runTool(browser_snapshot, {}, { sandbox: { defaultExec: '{"nope":1}' } });
    expect(output).toBe('{"nope":1}');
  });

  it("returns raw output when the response is not JSON", async () => {
    const { output } = await runTool(browser_snapshot, {}, { sandbox: { defaultExec: "@e1 link Home" } });
    expect(output).toBe("@e1 link Home");
  });

  it("propagates a failure as a throw", async () => {
    await expect(
      runTool(browser_snapshot, {}, { sandbox: { defaultExec: { exitCode: 1, stderr: "no page open" } } }),
    ).rejects.toThrow(/no page open/);
  });
});
