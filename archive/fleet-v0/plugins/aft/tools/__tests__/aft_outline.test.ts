import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_outline from "../aft_outline";

const reply = (text: string) => JSON.stringify({ id: "1", success: true, text });

const outline = (input: Record<string, unknown>, exec: Record<string, unknown> | string = reply("plugin.ts\n  - fn tool 10:20")) =>
  runTool(aft_outline, input, { sandbox: typeof exec === "string" ? { defaultExec: exec } : { exec: exec as never } });

/** The JSON request the transport piped to the binary. */
const sent = (command: string): Record<string, unknown> => {
  const m = command.match(/printf '%s\\n' '(.+?)' \|/s);
  if (!m) throw new Error(`no request in: ${command}`);
  return JSON.parse(m[1].replace(/'\\''/g, "'")) as Record<string, unknown>;
};

describe("aft_outline — help", () => {
  it("returns documentation without invoking aft", async () => {
    const { output, sandbox } = await outline({ help: true });

    expect(output).toContain("aft_outline");
    expect(output).toContain("ARGUMENTS");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});

describe("aft_outline — param selection", () => {
  it("sends the target as `file` by default", async () => {
    const { sandbox } = await outline({ target: "src/app.ts" });

    expect(sent(sandbox.lastCommand())).toMatchObject({ command: "outline", file: "src/app.ts" });
  });

  it("sends `directory` when explicitly told", async () => {
    const { sandbox } = await outline({ target: "src/api", directory: true });

    const req = sent(sandbox.lastCommand());
    expect(req).toMatchObject({ command: "outline", directory: "src/api" });
    // file and directory are NOT interchangeable — a directory passed as file
    // fails with "Is a directory".
    expect(req.file).toBeUndefined();
    expect(sandbox.execCalls).toHaveLength(1);
  });

  it("RETRIES as a directory when `file` reports a directory", async () => {
    const { output, sandbox } = await outline(
      { target: "src/api" },
      {
        // The transport pipes the request in, so the request text distinguishes
        // the two attempts.
        '"file":"src/api"': JSON.stringify({
          success: false,
          code: "file_not_found",
          message: "file not found: src/api: Is a directory (os error 21)",
        }),
        '"directory":"src/api"': reply("api/\n  index.ts"),
      },
    );

    expect(sandbox.execCalls).toHaveLength(2);
    expect(output).toContain("api/");
  });

  it("does not retry when the file outline succeeds", async () => {
    const { sandbox } = await outline({ target: "src/app.ts" });

    expect(sandbox.execCalls).toHaveLength(1);
  });

  it("reports the FILE error when neither form works", async () => {
    const { output } = await outline(
      { target: "nope" },
      {
        '"file":"nope"': JSON.stringify({ success: false, code: "file_not_found", message: "file not found: nope" }),
        '"directory":"nope"': JSON.stringify({
          success: false,
          code: "file_not_found",
          message: "directory not found: nope",
        }),
      },
    );

    // The file-shaped error is the more useful one — most targets are files.
    expect(output).toContain("file not found: nope");
  });
});

describe("aft_outline — output", () => {
  it("passes the structural text through", async () => {
    const { output } = await outline({ target: "src/app.ts" }, reply("app.ts\n  - fn handleRequest 10:25"));

    expect(output).toBe("app.ts\n  - fn handleRequest 10:25");
  });

  it("surfaces a protocol failure as a readable string", async () => {
    const { output } = await outline(
      { target: "x" },
      JSON.stringify({ success: false, code: "file_not_found", message: "file not found: x" }),
    );

    expect(output).toContain("file_not_found");
  });

  it("reports a missing binary distinctly", async () => {
    const { output } = await runTool(
      aft_outline,
      { target: "x" },
      { sandbox: { defaultExec: { exitCode: 127, stderr: "aft: command not found" } } },
    );

    expect(output).toContain("aft binary not found");
  });
});
