import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_zoom from "../aft_zoom";

describe("aft_zoom", () => {
  it("builds a zoom command with --file and --symbol", async () => {
    const { sandbox } = await runTool(aft_zoom, { filePath: "src/app.ts", symbol: "main" });
    expect(sandbox.lastCommand()).toBe("aft 'zoom' '--json' '--file' 'src/app.ts' '--symbol' 'main'");
  });

  it("omits --context when contextLines is not given", async () => {
    const { sandbox } = await runTool(aft_zoom, { filePath: "a.ts", symbol: "f" });
    expect(sandbox.lastCommand()).not.toContain("--context");
  });

  it("appends --context with the line count", async () => {
    const { sandbox } = await runTool(aft_zoom, { filePath: "a.ts", symbol: "f", contextLines: 5 });
    expect(sandbox.lastCommand()).toContain("'--context' '5'");
  });

  it("omits --context for zero (falsy) rather than sending 0", async () => {
    const { sandbox } = await runTool(aft_zoom, { filePath: "a.ts", symbol: "f", contextLines: 0 });
    expect(sandbox.lastCommand()).not.toContain("--context");
  });

  it("handles a heading with spaces as the symbol", async () => {
    const { sandbox } = await runTool(aft_zoom, { filePath: "README.md", symbol: "Getting Started" });
    expect(sandbox.lastCommand()).toContain("'--symbol' 'Getting Started'");
  });

  it("returns the CLI payload unchanged", async () => {
    const { output } = await runTool(
      aft_zoom,
      { filePath: "a.ts", symbol: "f" },
      { sandbox: { defaultExec: "function f() {}" } },
    );
    expect(output).toBe("function f() {}");
  });

  it("surfaces a missing symbol as an error string", async () => {
    const { output } = await runTool(
      aft_zoom,
      { filePath: "a.ts", symbol: "ghost" },
      { sandbox: { defaultExec: { exitCode: 1, stderr: "symbol not found" } } },
    );
    expect(output).toContain("symbol not found");
  });
});
