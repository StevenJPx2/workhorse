// The ab() helper is the single exec path for every browser tool, and unlike
// aft() it THROWS on failure — so each tool's error propagation depends on it.

import { describe, expect, it } from "vitest";
import { fakeSandbox } from "@workhorse/test-utils/tools";
import { WRAPPER, ab, q } from "../_shared";

describe("q() shell quoting", () => {
  it("wraps a plain string in single quotes", () => {
    expect(q("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes", () => {
    expect(q("it's")).toBe("'it'\\''s'");
  });

  it("neutralizes shell metacharacters", () => {
    expect(q("a; rm -rf /")).toBe("'a; rm -rf /'");
  });

  it("handles an empty string", () => {
    expect(q("")).toBe("''");
  });
});

describe("ab() exec helper", () => {
  it("invokes the agent-browser wrapper with quoted args", async () => {
    const sandbox = fakeSandbox({ defaultExec: "{}" });
    await ab(sandbox, ["open", "https://example.com"]);

    expect(sandbox.lastCommand()).toBe(`${WRAPPER} 'open' 'https://example.com'`);
  });

  it("applies a 60s timeout", async () => {
    const sandbox = fakeSandbox({ defaultExec: "{}" });
    await ab(sandbox, ["snapshot"]);

    expect(sandbox.execCalls[0].timeout).toBe(60_000);
  });

  it("returns stdout on success", async () => {
    const sandbox = fakeSandbox({ defaultExec: '{"url":"https://x.test"}' });
    expect(await ab(sandbox, ["open", "x"])).toBe('{"url":"https://x.test"}');
  });

  it("THROWS on a nonzero exit, naming the subcommand", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 1, stderr: "no such page" } });
    await expect(ab(sandbox, ["snapshot"])).rejects.toThrow(/agent-browser snapshot: no such page/);
  });

  it("falls back to stdout in the thrown message when stderr is empty", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 1, stdout: "crashed", stderr: "" } });
    await expect(ab(sandbox, ["open", "x"])).rejects.toThrow(/crashed/);
  });

  it("truncates a huge failure message to 500 characters of context", async () => {
    const sandbox = fakeSandbox({ defaultExec: { exitCode: 1, stderr: "y".repeat(2000) } });

    const err = await ab(sandbox, ["open", "x"]).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message.length).toBeLessThan(600);
  });
});
