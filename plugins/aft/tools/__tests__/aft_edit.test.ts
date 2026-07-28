import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_edit from "../aft_edit";

describe("aft_edit", () => {
  it("always passes --file", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "src/app.ts" });
    expect(sandbox.lastCommand()).toBe("aft 'edit' '--json' '--file' 'src/app.ts'");
  });

  it("builds a find/replace edit with --old and --new", async () => {
    const { sandbox } = await runTool(aft_edit, {
      filePath: "a.ts",
      oldString: "const x = 1",
      newString: "const x = 2",
    });
    expect(sandbox.lastCommand()).toContain("'--old' 'const x = 1' '--new' 'const x = 2'");
  });

  it("builds a symbol replace with --symbol and --content", async () => {
    const { sandbox } = await runTool(aft_edit, {
      filePath: "a.ts",
      symbol: "handler",
      content: "function handler() {}",
    });
    expect(sandbox.lastCommand()).toContain("'--symbol' 'handler'");
    expect(sandbox.lastCommand()).toContain("'--content' 'function handler() {}'");
  });

  it("orders flags symbol, old, new, content, replace-all", async () => {
    const { sandbox } = await runTool(aft_edit, {
      filePath: "a.ts",
      symbol: "s",
      oldString: "o",
      newString: "n",
      content: "c",
      replaceAll: true,
    });
    expect(sandbox.lastCommand()).toBe(
      "aft 'edit' '--json' '--file' 'a.ts' '--symbol' 's' '--old' 'o' '--new' 'n' '--content' 'c' '--replace-all'",
    );
  });

  it("sends an EMPTY newString — deletion must not be dropped as falsy", async () => {
    // The guard is `!= null`, not truthiness: deleting text means new="".
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", oldString: "junk", newString: "" });
    expect(sandbox.lastCommand()).toContain("'--new' ''");
  });

  it("sends an EMPTY oldString rather than dropping it", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", oldString: "", newString: "x" });
    expect(sandbox.lastCommand()).toContain("'--old' ''");
  });

  it("sends EMPTY content (symbol deletion) rather than dropping it", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", symbol: "dead", content: "" });
    expect(sandbox.lastCommand()).toContain("'--content' ''");
  });

  it("omits --replace-all when false", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", oldString: "a", newString: "b", replaceAll: false });
    expect(sandbox.lastCommand()).not.toContain("--replace-all");
  });

  it("adds --replace-all when true", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", oldString: "a", newString: "b", replaceAll: true });
    expect(sandbox.lastCommand()).toContain("'--replace-all'");
  });

  it("preserves newlines inside replacement content", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", symbol: "f", content: "line1\nline2" });
    expect(sandbox.lastCommand()).toContain("'line1\nline2'");
  });

  it("escapes single quotes in replacement content", async () => {
    const { sandbox } = await runTool(aft_edit, { filePath: "a.ts", oldString: "x", newString: "it's" });
    expect(sandbox.lastCommand()).toContain("'it'\\''s'");
  });

  it("surfaces a write-gate rejection as an error string, not a throw", async () => {
    const { output } = await runTool(
      aft_edit,
      { filePath: "/etc/passwd", oldString: "a", newString: "b" },
      { sandbox: { defaultExec: { exitCode: 1, stderr: "write blocked: outside writeAllow" } } },
    );
    expect(output).toContain("write blocked");
  });

  it("returns the CLI result on success", async () => {
    const { output } = await runTool(
      aft_edit,
      { filePath: "a.ts", oldString: "a", newString: "b" },
      { sandbox: { defaultExec: '{"success":true}' } },
    );
    expect(output).toBe('{"success":true}');
  });
});
