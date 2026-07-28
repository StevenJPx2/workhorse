import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_inspect from "../aft_inspect";

describe("aft_inspect", () => {
  it("runs a bare inspect when no options are given", async () => {
    const { sandbox } = await runTool(aft_inspect, {});
    expect(sandbox.lastCommand()).toBe("aft 'inspect' '--json'");
  });

  it("adds --scope when a scope is given", async () => {
    const { sandbox } = await runTool(aft_inspect, { scope: "src/api" });
    expect(sandbox.lastCommand()).toBe("aft 'inspect' '--json' '--scope' 'src/api'");
  });

  it("joins sections with commas into a single --sections argument", async () => {
    const { sandbox } = await runTool(aft_inspect, { sections: ["todos", "dead_code"] });
    expect(sandbox.lastCommand()).toBe("aft 'inspect' '--json' '--sections' 'todos,dead_code'");
  });

  it("combines scope and sections in order", async () => {
    const { sandbox } = await runTool(aft_inspect, { scope: "src", sections: ["diagnostics"] });
    expect(sandbox.lastCommand()).toBe("aft 'inspect' '--json' '--scope' 'src' '--sections' 'diagnostics'");
  });

  it("omits --sections for an empty array", async () => {
    const { sandbox } = await runTool(aft_inspect, { sections: [] });
    expect(sandbox.lastCommand()).not.toContain("--sections");
  });

  it("sends a single section without a trailing comma", async () => {
    const { sandbox } = await runTool(aft_inspect, { sections: ["todos"] });
    expect(sandbox.lastCommand()).toContain("'--sections' 'todos'");
  });

  it("returns the health snapshot unchanged", async () => {
    const { output } = await runTool(aft_inspect, {}, { sandbox: { defaultExec: '{"diagnostics":0}' } });
    expect(output).toBe('{"diagnostics":0}');
  });

  it("surfaces a CLI failure as an error string", async () => {
    const { output } = await runTool(
      aft_inspect,
      {},
      { sandbox: { defaultExec: { exitCode: 3, stderr: "no project" } } },
    );
    expect(output).toContain("aft error (exit 3)");
  });
});
