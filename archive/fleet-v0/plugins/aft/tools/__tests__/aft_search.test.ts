import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_search from "../aft_search";

const matches = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "1",
    success: true,
    text: "packages/api/src/plugin.ts\n37: function defineTool<",
    total_matches: 3,
    files_searched: 220,
    index_status: "Indexed",
    truncated: false,
    ...over,
  });

const search = (input: Record<string, unknown>, exec: string = matches()) =>
  runTool(aft_search, input, { sandbox: { defaultExec: exec } });

const sent = (command: string): Record<string, unknown> => {
  const m = command.match(/printf '%s\\n' '(.+?)' \|/s);
  if (!m) throw new Error(`no request in: ${command}`);
  return JSON.parse(m[1].replace(/'\\''/g, "'")) as Record<string, unknown>;
};

describe("aft_search — help", () => {
  it("documents that patterns are REGEX, not AST", async () => {
    const { output, sandbox } = await search({ help: true });

    expect(output).toContain("REGULAR EXPRESSION");
    // The old docs promised ast-grep meta-variables that never worked.
    expect(output).toContain("NOT ast-grep");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});

describe("aft_search — request", () => {
  it("maps to the `grep` command, not a nonexistent `search`", async () => {
    const { sandbox } = await search({ pattern: "defineTool" });

    expect(sent(sandbox.lastCommand())).toMatchObject({ command: "grep", pattern: "defineTool" });
  });

  it("forwards a path to narrow the scan", async () => {
    const { sandbox } = await search({ pattern: "x", path: "packages" });

    expect(sent(sandbox.lastCommand())).toMatchObject({ path: "packages" });
  });

  it("omits path when not given", async () => {
    const { sandbox } = await search({ pattern: "x" });

    expect(sent(sandbox.lastCommand()).path).toBeUndefined();
  });

  it("does NOT send a lang param — it is silently ignored by the backend", async () => {
    const { sandbox } = await search({ pattern: "x" });

    // AFT accepts unknown params and ignores them, so a `lang` filter would
    // look scoped while searching everything. Better not to offer it.
    expect(sent(sandbox.lastCommand()).lang).toBeUndefined();
  });

  it("passes regex metacharacters through intact", async () => {
    const { sandbox } = await search({ pattern: "^export function \\w+Tool" });

    expect(sent(sandbox.lastCommand()).pattern).toBe("^export function \\w+Tool");
  });
});

describe("aft_search — output", () => {
  it("returns the match text", async () => {
    const { output } = await search({ pattern: "defineTool" });

    expect(output).toContain("packages/api/src/plugin.ts");
    expect(output).toContain("37: function defineTool<");
  });

  it("reports no matches plainly", async () => {
    const { output } = await search({ pattern: "zzz" }, matches({ text: "", total_matches: 0 }));

    expect(output).toBe("(no matches)");
  });

  it("FLAGS a fallback scan — silently degraded results are worse than a caveat", async () => {
    const { output } = await search({ pattern: "x" }, matches({ index_status: "Fallback" }));

    expect(output).toContain("index unavailable");
  });

  it("does not add the caveat when the index was used", async () => {
    const { output } = await search({ pattern: "x" }, matches({ index_status: "Indexed" }));

    expect(output).not.toContain("index unavailable");
  });

  it("notes truncation so the agent knows results are partial", async () => {
    const { output } = await search({ pattern: "x" }, matches({ truncated: true }));

    expect(output).toContain("results truncated");
  });

  it("surfaces a protocol failure", async () => {
    const { output } = await search(
      { pattern: "[" },
      JSON.stringify({ success: false, code: "invalid_request", message: "invalid regex" }),
    );

    expect(output).toContain("invalid_request");
    expect(output).toContain("invalid regex");
  });
});
