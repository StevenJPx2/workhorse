import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_search from "../aft_search";

describe("aft_search", () => {
  it("builds a search command with --lang and --pattern", async () => {
    const { sandbox } = await runTool(aft_search, { pattern: "console.log($MSG)", lang: "typescript" });
    expect(sandbox.lastCommand()).toBe(
      "aft 'search' '--json' '--lang' 'typescript' '--pattern' 'console.log($MSG)'",
    );
  });

  it("appends paths after the pattern", async () => {
    const { sandbox } = await runTool(aft_search, {
      pattern: "$X",
      lang: "typescript",
      paths: ["src", "test"],
    });
    expect(sandbox.lastCommand()).toBe("aft 'search' '--json' '--lang' 'typescript' '--pattern' '$X' 'src' 'test'");
  });

  it("omits paths when absent", async () => {
    const { sandbox } = await runTool(aft_search, { pattern: "$X", lang: "go" });
    expect(sandbox.lastCommand()).toMatch(/'--pattern' '\$X'$/);
  });

  it("tolerates an empty paths array", async () => {
    const { sandbox } = await runTool(aft_search, { pattern: "$X", lang: "go", paths: [] });
    expect(sandbox.lastCommand()).toMatch(/'--pattern' '\$X'$/);
  });

  it("preserves meta-variables without shell expansion", async () => {
    const { sandbox } = await runTool(aft_search, { pattern: "fn $NAME($$$) { $$$ }", lang: "rust" });
    // Single-quoted, so $NAME and $$$ reach the CLI literally.
    expect(sandbox.lastCommand()).toContain("'fn $NAME($$$) { $$$ }'");
  });

  it("escapes a pattern containing a single quote", async () => {
    const { sandbox } = await runTool(aft_search, { pattern: "x['y']", lang: "typescript" });
    expect(sandbox.lastCommand()).toContain("'x['\\''y'\\'']'");
  });

  it("returns matches unchanged", async () => {
    const { output } = await runTool(
      aft_search,
      { pattern: "$X", lang: "typescript" },
      { sandbox: { defaultExec: '{"matches":[]}' } },
    );
    expect(output).toBe('{"matches":[]}');
  });

  it("surfaces an invalid-pattern failure as an error string", async () => {
    const { output } = await runTool(
      aft_search,
      { pattern: "((((", lang: "typescript" },
      { sandbox: { defaultExec: { exitCode: 1, stderr: "invalid pattern" } } },
    );
    expect(output).toContain("invalid pattern");
  });
});
