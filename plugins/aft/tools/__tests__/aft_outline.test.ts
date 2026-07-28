import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_outline from "../aft_outline";

describe("aft_outline", () => {
  it("builds an outline command with --json and the target last", async () => {
    const { sandbox } = await runTool(aft_outline, { target: "src/app.ts" });
    expect(sandbox.lastCommand()).toBe("aft 'outline' '--json' 'src/app.ts'");
  });

  it("omits --files when the flag is not set", async () => {
    const { sandbox } = await runTool(aft_outline, { target: "src" });
    expect(sandbox.lastCommand()).not.toContain("--files");
  });

  it("adds --files before the target when requested", async () => {
    const { sandbox } = await runTool(aft_outline, { target: "src", files: true });
    expect(sandbox.lastCommand()).toBe("aft 'outline' '--json' '--files' 'src'");
  });

  it("omits --files when explicitly false", async () => {
    const { sandbox } = await runTool(aft_outline, { target: "src", files: false });
    expect(sandbox.lastCommand()).not.toContain("--files");
  });

  it("passes the CLI output through unchanged", async () => {
    const payload = '{"symbols":[{"name":"main","line":1}]}';
    const { output } = await runTool(
      aft_outline,
      { target: "src/app.ts" },
      { sandbox: { exec: { "aft 'outline'": payload } } },
    );
    expect(output).toBe(payload);
  });

  it("surfaces a CLI failure as an error string rather than throwing", async () => {
    const { output } = await runTool(
      aft_outline,
      { target: "nope.ts" },
      { sandbox: { defaultExec: { exitCode: 1, stderr: "not found" } } },
    );
    expect(output).toContain("aft error (exit 1)");
  });

  it("quotes a target containing spaces", async () => {
    const { sandbox } = await runTool(aft_outline, { target: "src/my file.ts" });
    expect(sandbox.lastCommand()).toContain("'src/my file.ts'");
  });
});
