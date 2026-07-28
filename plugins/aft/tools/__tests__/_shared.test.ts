// The transport is where the old bug lived: it shelled out as
// `aft outline --json <file>`, which the binary ignores. These tests pin the
// real protocol — JSON on stdin, one reply per line on stdout.

import { describe, expect, it } from "vitest";
import { fakeSandbox } from "@workhorse/test-utils/tools";
import { aft, aftRequest, aftSequence } from "../_shared";

/** Parse the JSON request out of the `printf '%s\n' '<json>' | <bin>` command. */
function sentRequest(command: string): Record<string, unknown> {
  const match = command.match(/printf '%s\\n' '(.+?)' \|/s);
  if (!match) throw new Error(`no request found in: ${command}`);
  // Shell-unescape the single-quote sequence the quoter produces.
  return JSON.parse(match[1].replace(/'\\''/g, "'")) as Record<string, unknown>;
}

describe("aft transport — request shape", () => {
  it("pipes a JSON request to the binary on STDIN, not as argv", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"id":"1","success":true,"text":"ok"}' });
    await aftRequest(sandbox, "outline", { file: "src/app.ts" });

    const cmd = sandbox.lastCommand();
    expect(cmd).toContain("printf");
    expect(cmd).toContain("|");
    // The old form. If it ever comes back, the binary silently no-ops.
    expect(cmd).not.toContain("--json");
    expect(cmd).not.toMatch(/aft outline/);
  });

  it("sends a STRING id — a numeric id is a hard parse error", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "outline", { file: "src/app.ts" });

    expect(sentRequest(sandbox.lastCommand()).id).toBe("1");
  });

  it("puts params at the TOP LEVEL, not nested under input/params", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "zoom", { file: "src/app.ts", symbol: "handleRequest" });

    const req = sentRequest(sandbox.lastCommand());
    expect(req).toMatchObject({ command: "zoom", file: "src/app.ts", symbol: "handleRequest" });
    expect(req.input).toBeUndefined();
    expect(req.params).toBeUndefined();
  });

  it("sends `command` only — sending `method` too is a duplicate-field error", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "outline", { file: "x" });

    const req = sentRequest(sandbox.lastCommand());
    expect(req.command).toBe("outline");
    expect(req.method).toBeUndefined();
  });

  it("uses printf rather than echo — echo mangles backslashes in patterns", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "grep", { pattern: "\\bword\\b" });

    expect(sandbox.lastCommand()).toContain("printf");
    expect(sentRequest(sandbox.lastCommand()).pattern).toBe("\\bword\\b");
  });

  it("escapes a single quote in a param so it cannot break out of the shell", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "grep", { pattern: "it's" });

    expect(sandbox.lastCommand()).toContain("'\\''");
    expect(sentRequest(sandbox.lastCommand()).pattern).toBe("it's");
  });

  it("resolves the binary from AFT's cache, since it is NOT on PATH", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "status");

    // Bare `aft` is exit 127 in the container — the harness installer only
    // populates ~/.cache/aft/bin/v<version>/aft.
    expect(sandbox.lastCommand()).toContain(".cache/aft/bin");
    expect(sandbox.lastCommand()).toContain("sort -V | tail -1");
  });

  it("applies a generous timeout — indexing a large repo is slow", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"ok"}' });
    await aftRequest(sandbox, "grep", { pattern: "x" });

    expect(sandbox.execCalls[0].timeout).toBe(120_000);
  });
});

describe("aft transport — reply handling", () => {
  it("parses the reply line, ignoring stderr diagnostics", async () => {
    const sandbox = fakeSandbox({
      defaultExec: {
        stdout: '{"id":"1","success":true,"text":"plugin.ts"}',
        stderr: "[aft] started, pid 123\n[aft] stdin closed",
      },
    });

    const reply = await aftRequest(sandbox, "outline", { file: "x" });
    expect(reply).toMatchObject({ success: true, text: "plugin.ts" });
  });

  it("finds the reply even when the binary prints noise first", async () => {
    const sandbox = fakeSandbox({
      defaultExec: { stdout: 'warming up...\n{"id":"1","success":true,"text":"ok"}' },
    });

    const reply = await aftRequest(sandbox, "outline", { file: "x" });
    expect(reply).toMatchObject({ text: "ok" });
  });

  it("reports a MISSING BINARY distinctly instead of looking like a tool failure", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 127, stderr: "aft: command not found" } });

    const reply = await aftRequest(sandbox, "outline", { file: "x" });
    expect("error" in reply && reply.error).toContain("aft binary not found");
  });

  it("reports empty output as an error — NOT as success", async () => {
    // THE ORIGINAL BUG: exit 0 with empty stdout was treated as success and
    // rendered "(no output)", so every tool looked like it worked.
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 0, stdout: "", stderr: "[aft] stdin closed" } });

    const reply = await aftRequest(sandbox, "outline", { file: "x" });
    expect("error" in reply).toBe(true);
    expect("error" in reply && reply.error).toContain("no reply");
  });

  it("reports unparseable output rather than crashing", async () => {
    const sandbox = fakeSandbox({ defaultExec: "{not json" });

    const reply = await aftRequest(sandbox, "outline", { file: "x" });
    expect("error" in reply && reply.error).toContain("not JSON");
  });
});

describe("aft() rendering", () => {
  it("returns the text payload on success", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"text":"plugin.ts\\n  - fn tool 10:20"}' });

    expect(await aft(sandbox, "outline", { file: "x" })).toBe("plugin.ts\n  - fn tool 10:20");
  });

  it("renders a protocol failure as a readable string, never a throw", async () => {
    const sandbox = fakeSandbox({
      defaultExec: '{"success":false,"code":"file_not_found","message":"file not found: nope.ts"}',
    });

    // A missing file is information the agent should act on, not a stage-ender.
    const out = await aft(sandbox, "outline", { file: "nope.ts" });
    expect(out).toContain("file_not_found");
    expect(out).toContain("nope.ts");
  });

  it("strips the envelope when a reply has no text field", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"id":"1","success":true,"name":"tool","kind":"function"}' });

    const out = await aft(sandbox, "zoom", { file: "x", symbol: "tool" });
    expect(out).toContain("function");
    // Transport fields are noise to the agent.
    expect(out).not.toContain('"success"');
    expect(out).not.toContain('"id"');
  });

  it("reports a placeholder for a genuinely empty payload", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"id":"1","success":true,"text":""}' });

    expect(await aft(sandbox, "status")).toBe("(no output)");
  });

  it("accepts a custom renderer", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"success":true,"total_matches":7}' });

    const out = await aft(sandbox, "grep", { pattern: "x" }, (r) => `${r.total_matches} matches`);
    expect(out).toBe("7 matches");
  });
});

describe("aftSequence", () => {
  it("sends several requests down ONE stdin stream with distinct ids", async () => {
    const sandbox = fakeSandbox({
      defaultExec: '{"id":"1","success":true}\n{"id":"2","success":true,"text":"ok"}',
    });

    await aftSequence(sandbox, [
      { command: "configure", params: { harness: "runner", project_root: "/workspace" } },
      { command: "inspect" },
    ]);

    // One exec: configure only applies to the process it ran in, so a second
    // exec would lose it entirely.
    expect(sandbox.execCalls).toHaveLength(1);
    const cmd = sandbox.lastCommand();
    expect(cmd).toContain('"id":"1"');
    expect(cmd).toContain('"id":"2"');
    expect(cmd).toContain("configure");
    expect(cmd).toContain("inspect");
  });

  it("returns one parsed reply per line, in order", async () => {
    const sandbox = fakeSandbox({
      defaultExec: '{"id":"1","success":true,"text":"first"}\n{"id":"2","success":true,"text":"second"}',
    });

    const replies = await aftSequence(sandbox, [{ command: "a" }, { command: "b" }]);
    expect(Array.isArray(replies)).toBe(true);
    if (Array.isArray(replies)) {
      expect(replies).toHaveLength(2);
      expect(replies[0].text).toBe("first");
      expect(replies[1].text).toBe("second");
    }
  });

  it("matches replies BY ID, skipping unsolicited notification lines", async () => {
    const sandbox = fakeSandbox({
      defaultExec: [
        '{"id":"1","success":true,"project_root":"/workspace"}',
        // AFT really emits this between replies.
        '{"type":"configure_warnings","session_id":null,"warnings":[]}',
        '{"id":"2","success":true,"text":"the answer"}',
      ].join("\n"),
    });

    const replies = await aftSequence(sandbox, [{ command: "configure" }, { command: "inspect" }]);

    // Positional pairing would give request 2 the notification.
    if (Array.isArray(replies)) {
      expect(replies).toHaveLength(2);
      expect(replies[1].text).toBe("the answer");
    }
  });

  it("reports a request that got no reply rather than shifting the rest", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"id":"1","success":true}' });

    const replies = await aftSequence(sandbox, [{ command: "a" }, { command: "b" }]);
    if (Array.isArray(replies)) {
      expect(replies[0].success).toBe(true);
      expect(replies[1].code).toBe("no_reply");
    }
  });

  it("marks an unparseable line without discarding valid replies", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{bad\n{"id":"2","success":true,"text":"ok"}' });

    const replies = await aftSequence(sandbox, [{ command: "a" }, { command: "b" }]);
    if (Array.isArray(replies)) {
      expect(replies[1].text).toBe("ok");
    }
  });

  it("reports a missing binary", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 127, stderr: "command not found" } });

    const replies = await aftSequence(sandbox, [{ command: "a" }]);
    expect("error" in replies && replies.error).toContain("aft binary not found");
  });
});
