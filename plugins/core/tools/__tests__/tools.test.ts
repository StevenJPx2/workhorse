// The core workspace tools. These were worker-inlined closures with no tests; as
// ordinary factories they get the same treatment as every other tool surface.

import { fakeSandbox, runTool } from "@workhorse/test-utils/tools";
import { describe, expect, it } from "vitest";
import bash from "../bash";
import edit from "../edit";
import find from "../find";
import grep from "../grep";
import ls from "../ls";
import read from "../read";
import write from "../write";

const DIR = "/workspace/.workflow/r1/stages/s/round-1";
const policy = (writeAllow: string[] = []) => ({ dir: DIR, writeAllow });

describe("read", () => {
  it("returns a file's contents", async () => {
    const { output } = await runTool(read, { path: "a.ts" }, { sandbox: fakeSandbox({ files: { "a.ts": "hello" } }) });
    expect(output).toBe("hello");
  });

  it("reports a missing file rather than throwing", async () => {
    const { output } = await runTool(read, { path: "nope.ts" }, { sandbox: fakeSandbox() });
    expect(output).toContain("file not found: nope.ts");
  });

  it("caps output at 100 KiB", async () => {
    const huge = "x".repeat(200_000);
    const { output } = await runTool(read, { path: "big" }, { sandbox: fakeSandbox({ files: { big: huge } }) });

    // One read must not be able to flood a stage's whole context.
    expect(output.length).toBeLessThan(101_000);
    expect(output).toContain("truncated");
  });
});

describe("ls", () => {
  it("defaults to the workspace root", async () => {
    const { sandbox } = await runTool(ls, {}, { sandbox: fakeSandbox() });
    expect(sandbox.execCalls[0].command).toBe("ls -la '.'");
  });

  it("quotes a path with spaces", async () => {
    const { sandbox } = await runTool(ls, { path: "my dir" }, { sandbox: fakeSandbox() });
    expect(sandbox.execCalls[0].command).toBe("ls -la 'my dir'");
  });

  it("escapes an embedded quote", async () => {
    // An unescaped quote would end the argument and let the rest run as shell.
    const { sandbox } = await runTool(ls, { path: "it's" }, { sandbox: fakeSandbox() });
    expect(sandbox.execCalls[0].command).toContain("'it'\\''s'");
  });
});

describe("find", () => {
  it("searches by filename pattern", async () => {
    const { sandbox } = await runTool(find, { pattern: "*.ts" }, { sandbox: fakeSandbox({ exec: { find: "a.ts" } }) });
    expect(sandbox.execCalls[0].command).toContain("-name '*.ts'");
  });

  it("caps results at 200", async () => {
    const { sandbox } = await runTool(find, { pattern: "*" }, { sandbox: fakeSandbox({ exec: { find: "x" } }) });
    expect(sandbox.execCalls[0].command).toContain("head -200");
  });

  it("says so when nothing matched", async () => {
    const { output } = await runTool(find, { pattern: "*.zz" }, { sandbox: fakeSandbox({ exec: { find: "" } }) });
    expect(output).toBe("(no matches)");
  });
});

describe("grep", () => {
  it("searches recursively, case-insensitively, with an extended regex", async () => {
    const { sandbox } = await runTool(grep, { pattern: "TODO" }, { sandbox: fakeSandbox({ exec: { grep: "hit" } }) });
    expect(sandbox.execCalls[0].command).toContain("grep -rniE 'TODO'");
  });

  it("says so when nothing matched", async () => {
    const { output } = await runTool(grep, { pattern: "zzz" }, { sandbox: fakeSandbox({ exec: { grep: "" } }) });
    expect(output).toBe("(no matches)");
  });
});

describe("bash", () => {
  it("returns combined output on success", async () => {
    const { output } = await runTool(
      bash,
      { command: "echo hi" },
      { sandbox: fakeSandbox({ exec: { echo: "hi" } }) },
    );
    expect(output).toBe("hi");
  });

  it("reports the exit code on failure instead of throwing", async () => {
    const sandbox = fakeSandbox({ exec: { "bun test": { exitCode: 1, stdout: "2 failed", stderr: "" } } });
    const { output } = await runTool(bash, { command: "bun test" }, { sandbox });

    // A non-zero exit is information the agent must read, not an exception that
    // aborts the stage.
    expect(output).toContain("exit 1");
    expect(output).toContain("2 failed");
  });

  it("says so on empty successful output", async () => {
    const { output } = await runTool(bash, { command: "true" }, { sandbox: fakeSandbox({ exec: { true: "" } }) });
    expect(output).toBe("(exit 0, no output)");
  });

  it("caps the timeout at 5 minutes", async () => {
    const { sandbox } = await runTool(
      bash,
      { command: "sleep 999", timeout: 9_999_999 },
      { sandbox: fakeSandbox({ exec: { sleep: "" } }) },
    );
    expect(sandbox.execCalls[0].timeout).toBe(300_000);
  });

  it("keeps the TAIL of long output, not the head", async () => {
    const long = `${"a".repeat(40_000)}IMPORTANT_END`;
    const { output } = await runTool(bash, { command: "build" }, { sandbox: fakeSandbox({ exec: { build: long } }) });

    // A failing build's diagnosis is at the end.
    expect(output).toContain("IMPORTANT_END");
  });
});

describe("write", () => {
  it("writes a file and reports its size", async () => {
    const sandbox = fakeSandbox();
    const { output } = await runTool(write, { path: "new.ts", content: "abc" }, { sandbox, policy: policy() });

    expect(output).toContain("wrote new.ts (3 bytes)");
    expect(await sandbox.readFile("new.ts")).toBe("abc");
  });

  it("refuses a path outside the policy WITHOUT writing", async () => {
    const sandbox = fakeSandbox();
    const { output } = await runTool(
      write,
      { path: "/workspace/repo/secret.ts", content: "x" },
      { sandbox, policy: policy(["src/**"]) },
    );

    expect(output).toContain("write blocked");
    // The refusal must be enforcement, not advice.
    expect(await sandbox.readFile("/workspace/repo/secret.ts")).toBeNull();
  });

  it("allows the stage's own artifact directory", async () => {
    const sandbox = fakeSandbox();
    const { output } = await runTool(
      write,
      { path: `${DIR}/control.json`, content: "{}" },
      { sandbox, policy: policy(["src/**"]) },
    );

    expect(output).toContain("wrote");
  });
});

describe("edit", () => {
  it("replaces the first occurrence", async () => {
    const sandbox = fakeSandbox({ files: { "a.ts": "let x = 1; let x = 2;" } });
    await runTool(edit, { path: "a.ts", oldString: "let x", newString: "const x" }, { sandbox, policy: policy() });

    expect(await sandbox.readFile("a.ts")).toBe("const x = 1; let x = 2;");
  });

  it("reports a missing file", async () => {
    const { output } = await runTool(
      edit,
      { path: "nope", oldString: "a", newString: "b" },
      { sandbox: fakeSandbox(), policy: policy() },
    );
    expect(output).toContain("file not found");
  });

  it("reports an unmatched oldString rather than writing anything", async () => {
    const sandbox = fakeSandbox({ files: { "a.ts": "hello" } });
    const { output } = await runTool(
      edit,
      { path: "a.ts", oldString: "goodbye", newString: "x" },
      { sandbox, policy: policy() },
    );

    // Usually means the file differs from what the agent remembers, so it should
    // re-read rather than retry.
    expect(output).toContain("oldString not found");
    expect(await sandbox.readFile("a.ts")).toBe("hello");
  });

  it("refuses a path outside the policy WITHOUT editing", async () => {
    const sandbox = fakeSandbox({ files: { "/workspace/repo/locked.ts": "original" } });
    const { output } = await runTool(
      edit,
      { path: "/workspace/repo/locked.ts", oldString: "original", newString: "hacked" },
      { sandbox, policy: policy(["src/**"]) },
    );

    expect(output).toContain("edit blocked");
    expect(await sandbox.readFile("/workspace/repo/locked.ts")).toBe("original");
  });
});

describe("help", () => {
  it("documents every core tool without touching the sandbox", async () => {
    for (const factory of [read, ls, find, grep, bash, write, edit]) {
      const { output, sandbox } = await runTool(factory, { help: true }, { sandbox: fakeSandbox() });

      expect(output).toContain("ARGUMENTS");
      // help must never execute anything.
      expect(sandbox.execCalls).toHaveLength(0);
    }
  });
});
