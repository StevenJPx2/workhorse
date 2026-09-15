import { fakeEnv } from "@workhorse/test-utils/tools";
import { describe, expect, it, vi } from "vitest";
import createTool from "../tools/monitor_create";
import { daemonCall, daemonTarget } from "../tools/monitor_create";

function env() {
  return {
    ...fakeEnv(),
    SOURCEFED_WEBHOOK_SECRET: "secret",
    SOURCEFED_DAEMON_URL: "http://127.0.0.1:8788/",
  };
}

describe("sourcefed monitor tools", () => {
  it("resolves the daemon target (trailing slash stripped)", () => {
    expect(daemonTarget(env())).toEqual({ base: "http://127.0.0.1:8788", secret: "secret" });
  });

  it("returns null when the daemon is not configured", () => {
    expect(daemonTarget(fakeEnv())).toBeNull();
  });

  it("sends the create request with auth + body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await daemonCall({ base: "http://d", secret: "s" }, "POST", "/monitors", {
      kind: "github-pr",
      target: "a/b#1",
    });

    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://d/monitors",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-sourcefed-secret": "s" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("reports daemon unreachability as a soft error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const out = await daemonCall({ base: "http://d", secret: "s" }, "GET", "/monitors");
    expect(out.ok).toBe(false);
    expect(out.text).toContain("daemon unreachable");
    vi.unstubAllGlobals();
  });

  it("create tool explains when the daemon is not configured", async () => {
    const tool = createTool({} as never);
    const r = await tool.run({ input: { kind: "github-pr", target: "a/b#1" } } as never);
    // env missing → daemonTarget null → guidance message
    expect(String(r)).toContain("SOURCEFED_DAEMON_URL");
  });

  it("create tool calls the daemon and returns its body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m1", ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const e = env();

    const tool = createTool({ env: e } as never);
    const r = await tool.run({ input: { kind: "github-pr", target: "a/b#1", note: "watch" } } as never);
    expect(String(r)).toContain("m1");
    const [, opts] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(opts.body)).toMatchObject({ kind: "github-pr", target: "a/b#1", note: "watch" });
    vi.unstubAllGlobals();
  });
});
