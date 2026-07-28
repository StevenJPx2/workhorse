import { describe, expect, it } from "vitest";
import { runTool } from "@workhorse/test-utils/tools";
import aft_inspect from "../aft_inspect";

const CONFIGURED = JSON.stringify({ id: "1", success: true, project_root: "/workspace" });

const summary = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: "2",
    success: true,
    complete: true,
    summary: {
      diagnostics: { errors: 2, warnings: 5, status: "ready" },
      metrics: { files: 278, symbols: 1400, loc: 23571 },
      todos: { count: 7 },
      dead_code: { count: 3 },
      unused_exports: { count: 1 },
      duplicates: { count: 0 },
      ...(over.summary as Record<string, unknown>),
    },
    ...over,
  });

const inspect = (input: Record<string, unknown> = {}, stdout = `${CONFIGURED}\n${summary()}`) =>
  runTool(aft_inspect, input, { sandbox: { defaultExec: stdout } });

const sent = (command: string): Record<string, unknown>[] => {
  const m = command.match(/printf '%s\\n' '(.+?)' \|/s);
  if (!m) throw new Error(`no request in: ${command}`);
  return m[1]
    .replace(/'\\''/g, "'")
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
};

describe("aft_inspect — help", () => {
  it("returns documentation without invoking aft", async () => {
    const { output, sandbox } = await inspect({ help: true });

    expect(output).toContain("aft_inspect");
    expect(output).toContain("WHEN TO RUN");
    expect(sandbox.execCalls).toHaveLength(0);
  });
});

describe("aft_inspect — configure must precede inspect", () => {
  it("sends configure THEN inspect in a single stream", async () => {
    const { sandbox } = await inspect();

    // inspect refuses to run until configure has set the project root in the
    // SAME process, so two execs would fail every time.
    expect(sandbox.execCalls).toHaveLength(1);

    const requests = sent(sandbox.lastCommand());
    expect(requests[0]).toMatchObject({ command: "configure", harness: "runner", project_root: "/workspace" });
    expect(requests[1]).toMatchObject({ command: "inspect" });
  });

  it("forwards a scope as the inspect path", async () => {
    const { sandbox } = await inspect({ scope: "src" });

    expect(sent(sandbox.lastCommand())[1]).toMatchObject({ command: "inspect", path: "src" });
  });

  it("reports a configure failure rather than a confusing inspect error", async () => {
    const { output } = await inspect(
      {},
      JSON.stringify({ id: "1", success: false, code: "invalid_request", message: "missing project_root" }),
    );

    expect(output).toContain("configure failed");
    expect(output).toContain("missing project_root");
  });

  it("reports not_configured if inspect still refuses", async () => {
    const { output } = await inspect(
      {},
      `${CONFIGURED}\n${JSON.stringify({ id: "2", success: false, code: "not_configured", message: "configure must run before aft_inspect" })}`,
    );

    expect(output).toContain("inspect failed");
    expect(output).toContain("not_configured");
  });

  it("skips the unsolicited configure_warnings line AFT emits between replies", async () => {
    const { output } = await inspect(
      {},
      [CONFIGURED, '{"type":"configure_warnings","session_id":null,"warnings":[]}', summary()].join("\n"),
    );

    // Positional pairing would read the notification as the inspect reply.
    expect(output).toContain("diagnostics: 2 errors");
  });
});

describe("aft_inspect — summary rendering", () => {
  it("renders each category compactly", async () => {
    const { output } = await inspect();

    expect(output).toContain("diagnostics: 2 errors, 5 warnings");
    expect(output).toContain("metrics: 278 files");
    expect(output).toContain("todos: 7");
    expect(output).toContain("dead_code: 3");
    expect(output).toContain("unused_exports: 1");
    expect(output).toContain("duplicates: 0");
  });

  it("flags a PENDING diagnostics status — that is not a clean bill of health", async () => {
    const { output } = await inspect(
      {},
      `${CONFIGURED}\n${summary({ summary: { diagnostics: { errors: 0, warnings: 0, status: "pending" } } })}`,
    );

    // 0 errors while still analyzing is the most dangerous possible false
    // all-clear, since it arrives exactly when an agent wants to ship.
    expect(output).toContain("still analyzing");
  });

  it("distinguishes an UNAVAILABLE category from a zero count", async () => {
    const { output } = await inspect(
      {},
      `${CONFIGURED}\n${summary({
        summary: { dead_code: { status: "unavailable", reason: "call graph building" } },
      })}`,
    );

    expect(output).toContain("dead_code: unavailable (call graph building)");
    expect(output).not.toContain("dead_code: 0");
  });

  it("notes an incomplete run", async () => {
    const { output } = await inspect({}, `${CONFIGURED}\n${summary({ complete: false })}`);

    expect(output).toContain("incomplete");
  });

  it("does not note incompleteness on a complete run", async () => {
    const { output } = await inspect();

    expect(output).not.toContain("incomplete");
  });

  it("falls back to raw JSON when there is no summary", async () => {
    const { output } = await inspect({}, `${CONFIGURED}\n${JSON.stringify({ id: "2", success: true, odd: "shape" })}`);

    expect(output).toContain("odd");
  });

  it("reports a missing binary distinctly", async () => {
    const { output } = await runTool(
      aft_inspect,
      {},
      { sandbox: { defaultExec: { exitCode: 127, stderr: "command not found" } } },
    );

    expect(output).toContain("aft binary not found");
  });
});
