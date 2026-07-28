// The aft() helper is the single exec path for all five AFT tools, so its
// quoting and failure handling are tested once here rather than five times.

import { describe, expect, it } from "vitest";
import { fakeSandbox } from "@workhorse/test-utils/tools";
import { aft } from "../_shared";

describe("aft() exec helper", () => {
  it("invokes the aft CLI with shell-quoted arguments", async () => {
    const sandbox = fakeSandbox({ defaultExec: "ok" });
    await aft(sandbox, ["outline", "src/app.ts"]);

    expect(sandbox.lastCommand()).toBe("aft 'outline' 'src/app.ts'");
  });

  it("escapes embedded single quotes so a pattern cannot break out of the shell", async () => {
    const sandbox = fakeSandbox({ defaultExec: "ok" });
    await aft(sandbox, ["search", "it's"]);

    // '\'' is the POSIX idiom for a literal quote inside a quoted string.
    expect(sandbox.lastCommand()).toBe("aft 'search' 'it'\\''s'");
  });

  it("quotes arguments containing shell metacharacters", async () => {
    const sandbox = fakeSandbox({ defaultExec: "ok" });
    await aft(sandbox, ["search", "$VAR && rm -rf /"]);

    expect(sandbox.lastCommand()).toBe("aft 'search' '$VAR && rm -rf /'");
  });

  it("applies a 60s timeout", async () => {
    const sandbox = fakeSandbox({ defaultExec: "ok" });
    await aft(sandbox, ["outline", "x"]);

    expect(sandbox.execCalls[0].timeout).toBe(60_000);
  });

  it("returns stdout on success", async () => {
    const sandbox = fakeSandbox({ defaultExec: { stdout: '{"symbols":[]}' } });
    expect(await aft(sandbox, ["outline", "x"])).toBe('{"symbols":[]}');
  });

  it("reports a placeholder when a successful run produces no output", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 0, stdout: "" } });
    expect(await aft(sandbox, ["outline", "x"])).toBe("(no output)");
  });

  it("returns a readable error string on a nonzero exit — never throws", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 2, stderr: "no such file" } });
    const out = await aft(sandbox, ["outline", "missing.ts"]);

    expect(out).toContain("aft error (exit 2)");
    expect(out).toContain("no such file");
  });

  it("falls back to stdout for the error body when stderr is empty", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 1, stdout: "parse failure", stderr: "" } });
    expect(await aft(sandbox, ["outline", "x"])).toContain("parse failure");
  });

  it("truncates a huge error to the last 2000 characters", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 1, stderr: "x".repeat(5000) } });
    const out = await aft(sandbox, ["outline", "x"]);

    // prefix + exactly the 2000-char tail
    expect(out.length).toBeLessThan(2100);
    expect(out).toContain("aft error (exit 1)");
  });
});
