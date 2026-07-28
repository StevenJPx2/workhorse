import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import browser_snapshot from "../browser_snapshot";

describe("browser_snapshot", () => {
  it("requests interactive-only, compact, depth-10", async () => {
    const { sandbox } = await runTool(browser_snapshot, {}, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toContain("'snapshot' '-i' '-c' '-d' '10'");
  });

  it("ignores the depth input — the flags are fixed", async () => {
    // depth/compact are declared in the schema but the CLI call is hard-coded.
    // Asserting this documents the gap rather than pretending it works.
    const { sandbox } = await runTool(browser_snapshot, { depth: 3 }, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toContain("'-d' '10'");
  });

  it("ignores the compact input", async () => {
    const { sandbox } = await runTool(browser_snapshot, { compact: false }, { sandbox: { defaultExec: "{}" } });
    expect(sandbox.lastCommand()).toContain("'-c'");
  });

  it("unwraps the snapshot field", async () => {
    const { output } = await runTool(
      browser_snapshot,
      {},
      { sandbox: { defaultExec: '{"snapshot":"@e1 button Submit"}' } },
    );
    expect(output).toBe("@e1 button Submit");
  });

  it("returns the raw payload when the snapshot field is absent", async () => {
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
