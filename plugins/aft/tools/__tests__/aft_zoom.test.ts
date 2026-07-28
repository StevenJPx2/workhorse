import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_zoom from "../aft_zoom";

/** zoom answers with a STRUCTURED reply, not a text blob. */
const SYMBOL = JSON.stringify({
  id: "1",
  success: true,
  name: "handleRequest",
  kind: "function",
  range: { start_line: 110, start_col: 1, end_line: 157, end_col: 2 },
  content: "function handleRequest() {\n  return null;\n}",
});

const zoom = (input: Record<string, unknown>, exec: string = SYMBOL) =>
  runTool(aft_zoom, input, { sandbox: { defaultExec: exec } });

const sent = (command: string): Record<string, unknown> => {
  const m = command.match(/printf '%s\\n' '(.+?)' \|/s);
  if (!m) throw new Error(`no request in: ${command}`);
  return JSON.parse(m[1].replace(/'\\''/g, "'")) as Record<string, unknown>;
};

describe("aft_zoom — help", () => {
  it("returns documentation without invoking aft", async () => {
    const { output, sandbox } = await zoom({ help: true });

    expect(output).toContain("aft_zoom");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});

describe("aft_zoom — request", () => {
  it("sends file and symbol as top-level params", async () => {
    const { sandbox } = await zoom({ filePath: "src/app.ts", symbol: "handleRequest" });

    expect(sent(sandbox.lastCommand())).toMatchObject({
      command: "zoom",
      file: "src/app.ts",
      symbol: "handleRequest",
    });
  });

  it("sends contextLines as `context` — the protocol's name", async () => {
    const { sandbox } = await zoom({ filePath: "src/app.ts", symbol: "x", contextLines: 5 });

    expect(sent(sandbox.lastCommand())).toMatchObject({ context: 5 });
  });

  it("omits context when not requested", async () => {
    const { sandbox } = await zoom({ filePath: "src/app.ts", symbol: "x" });

    expect(sent(sandbox.lastCommand()).context).toBeUndefined();
  });
});

describe("aft_zoom — rendering the structured reply", () => {
  it("renders kind, name, line range, then the source", async () => {
    const { output } = await zoom({ filePath: "src/app.ts", symbol: "handleRequest" });

    expect(output).toContain("function handleRequest 110:157");
    expect(output).toContain("function handleRequest() {");
  });

  it("does NOT leak the transport envelope into the output", async () => {
    const { output } = await zoom({ filePath: "src/app.ts", symbol: "handleRequest" });

    expect(output).not.toContain('"success"');
    expect(output).not.toContain('"range"');
  });

  it("renders a header alone when there is no content", async () => {
    const { output } = await zoom(
      { filePath: "x", symbol: "T" },
      JSON.stringify({ success: true, name: "T", kind: "type", range: { start_line: 5, end_line: 5 } }),
    );

    expect(output).toBe("type T 5:5");
  });

  it("falls back to the start line when end_line is absent", async () => {
    const { output } = await zoom(
      { filePath: "x", symbol: "T" },
      JSON.stringify({ success: true, name: "T", kind: "const", range: { start_line: 9 }, content: "const T = 1;" }),
    );

    expect(output).toContain("const T 9:9");
  });

  it("degrades gracefully when the reply has no range", async () => {
    const { output } = await zoom({ filePath: "x", symbol: "T" }, JSON.stringify({ success: true, content: "body" }));

    expect(output).toContain("symbol ?");
    expect(output).toContain("body");
  });

  it("reports an unknown symbol rather than returning nothing", async () => {
    const { output } = await zoom(
      { filePath: "src/app.ts", symbol: "nope" },
      JSON.stringify({ success: false, code: "symbol_not_found", message: "symbol not found: nope" }),
    );

    expect(output).toContain("symbol_not_found");
    expect(output).toContain("nope");
  });
});
