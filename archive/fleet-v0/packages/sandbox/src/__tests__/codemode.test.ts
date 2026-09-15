// The Code Mode tool bridge — the capability gate below the model.
//
// The agent writes a program that runs in a disposable dynamic worker with no
// network; its only reach out is `env.TOOLS.invoke(name, input)` into this bridge.
// The stage's allowlist arrives in `ctx.props`, which the platform guarantees is
// authentic and the dynamic worker never sees.
//
// So this class is the thing standing between generated code and every tool in
// the fleet. It had no tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeDeps, ToolBridgeProps } from "../codemode";
import { makeToolBridge, runCode } from "../codemode";

vi.mock("@cloudflare/sandbox", () => ({ getSandbox: () => ({ exec: async () => ({ exitCode: 0 }) }) }));

const bridgeStub = { __bridge: true };
const loaded = vi.fn();

vi.mock("cloudflare:workers", () => ({
  // The real base class only supplies `env` and `ctx`; the tests construct with
  // both directly.
  WorkerEntrypoint: class {
    constructor(
      public ctx: { props: ToolBridgeProps },
      public env: unknown,
    ) {}
  },
  exports: { ToolBridge: () => bridgeStub },
}));

const props = (over: Partial<ToolBridgeProps> = {}): ToolBridgeProps => ({
  ticketId: "t1",
  repo: "acme/widgets",
  stage: "implement",
  selfOrigin: "https://w.dev",
  sandboxId: "ticket-t1",
  allow: ["read", "write"],
  dir: "/workspace/.workflow/implement",
  writeAllow: [],
  ...over,
});

/** A tool whose run() is scriptable, recorded by name. */
function tool(name: string, run: (c: { input: unknown }) => unknown = () => `${name} ran`) {
  return { name, description: name, inputSchema: {}, run: vi.fn(run) };
}

let available: ReturnType<typeof tool>[] = [];
const assembleStageTools = vi.fn((_ctx, allow: readonly string[]) =>
  available.filter((t) => allow.includes(t.name)),
);

const deps = { assembleStageTools, coreFor: () => ({}) } as never as BridgeDeps;

/** A bridge instance carrying these props. */
function bridge(p = props()) {
  const ToolBridge = makeToolBridge(deps);
  return new ToolBridge({ props: p } as never, {} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  available = [tool("read"), tool("write"), tool("bash")];
});

describe("tools()", () => {
  it("reports the props allowlist", async () => {
    expect(await bridge().tools()).toEqual(["read", "write"]);
  });

  it("reports an empty list when the stage was granted nothing", async () => {
    expect(await bridge(props({ allow: [] })).tools()).toEqual([]);
  });
});

describe("invoke() — the capability gate", () => {
  it("runs an allowed tool", async () => {
    expect(await bridge().invoke("read", { path: "/a" })).toBe("read ran");
  });

  it("REFUSES a tool outside the allowlist", async () => {
    const r = (await bridge().invoke("bash", {})) as { error: string };

    // bash exists and is assembled for other stages. Generated code asking for it
    // here must be refused by the props allowlist, not by whether it exists.
    expect(r.error).toContain("not in this stage's allowlist");
  });

  it("does not even assemble tools for a refused call", async () => {
    await bridge().invoke("bash", {});

    // The refusal happens before assembly, so a denied name cannot cause a tool
    // to be constructed (and its side effects to run).
    expect(assembleStageTools).not.toHaveBeenCalled();
  });

  it("reports the allowlist alongside the refusal", async () => {
    const r = (await bridge().invoke("bash", {})) as { allow: string[] };

    // The agent gets to see what it MAY call, so the next attempt is informed.
    expect(r.allow).toEqual(["read", "write"]);
  });

  it("refuses everything when the allowlist is empty", async () => {
    for (const name of ["read", "write", "bash"]) {
      expect(await bridge(props({ allow: [] })).invoke(name, {})).toMatchObject({ error: expect.any(String) });
    }
  });

  it("handles an allowed tool that is not actually assembled", async () => {
    available = [];
    const r = (await bridge().invoke("read", {})) as { error: string };

    // Allowlisted but missing: a spec naming a tool no plugin provides.
    expect(r.error).toContain("not available");
  });

  it("passes the input through", async () => {
    await bridge().invoke("read", { path: "/etc/hosts" });

    expect(available[0].run).toHaveBeenCalledWith({ input: { path: "/etc/hosts" } });
  });

  it("defaults a missing input to an empty object", async () => {
    await bridge().invoke("read", undefined);

    expect(available[0].run).toHaveBeenCalledWith({ input: {} });
  });

  it("returns an error object rather than throwing when a tool throws", async () => {
    available = [
      tool("read", () => {
        throw new Error("disk on fire");
      }),
    ];

    // A throw would surface as an opaque dynamic-worker crash; the agent can act
    // on a message.
    const r = (await bridge().invoke("read", {})) as { error: string };
    expect(r.error).toContain("disk on fire");
  });

  it("bounds a very long tool error", async () => {
    available = [
      tool("read", () => {
        throw new Error("x".repeat(2000));
      }),
    ];

    expect(((await bridge().invoke("read", {})) as { error: string }).error.length).toBeLessThan(400);
  });

  it("awaits an async tool", async () => {
    available = [tool("read", async () => "async result")];

    expect(await bridge().invoke("read", {})).toBe("async result");
  });
});

describe("the assembled context", () => {
  it("carries the ticket identity from props", async () => {
    await bridge().invoke("read", {});

    const ctx = assembleStageTools.mock.calls[0][0] as { ticket: Record<string, string> };
    expect(ctx.ticket).toEqual({ id: "t1", repo: "acme/widgets", stage: "implement" });
  });

  it("carries the WRITE POLICY from props", async () => {
    await bridge(props({ dir: "/d", writeAllow: ["src/**"] })).invoke("read", {});

    // Without this a run_code program would write anywhere, bypassing the same
    // gate a normal stage session enforces.
    const ctx = assembleStageTools.mock.calls[0][0] as { policy: unknown };
    expect(ctx.policy).toEqual({ dir: "/d", writeAllow: ["src/**"] });
  });

  it("assembles against the props allowlist, not everything available", async () => {
    await bridge(props({ allow: ["read"] })).invoke("read", {});

    expect(assembleStageTools.mock.calls[0][1]).toEqual(["read"]);
  });
});

describe("runCode", () => {
  /** An env whose Worker Loader records what it was asked to load. */
  function loaderEnv(fetchImpl: () => Promise<Response>) {
    return {
      LOADER: {
        load: vi.fn((spec: Record<string, unknown>) => {
          loaded(spec);
          return { getEntrypoint: () => ({ fetch: fetchImpl }) };
        }),
      },
    } as never;
  }

  const okFetch = async () => Response.json({ ok: true, result: 42, logs: ["hello"] });

  beforeEach(() => loaded.mockClear());

  it("returns the program result", async () => {
    const r = await runCode(loaderEnv(okFetch), props(), "return 42;");

    expect(r).toMatchObject({ ok: true, result: 42, logs: ["hello"] });
  });

  it("runs with NO NETWORK", async () => {
    await runCode(loaderEnv(okFetch), props(), "return 1;");

    // globalOutbound: null is the containment. Generated code reaching the
    // internet directly would bypass every gate the bridge enforces.
    expect(loaded.mock.calls[0][0]).toMatchObject({ globalOutbound: null });
  });

  it("binds ONLY the tool bridge", async () => {
    await runCode(loaderEnv(okFetch), props(), "return 1;");

    const spec = loaded.mock.calls[0][0] as { env: Record<string, unknown> };
    expect(Object.keys(spec.env)).toEqual(["TOOLS"]);
    expect(spec.env.TOOLS).toBe(bridgeStub);
  });

  it("caps CPU and subrequests", async () => {
    await runCode(loaderEnv(okFetch), props(), "return 1;");

    expect(loaded.mock.calls[0][0]).toMatchObject({ limits: { cpuMs: 30_000, subRequests: 100 } });
  });

  it("embeds the agent code in the module", async () => {
    await runCode(loaderEnv(okFetch), props(), "return await tools.read({ path: \"/a\" });");

    const spec = loaded.mock.calls[0][0] as { modules: Record<string, string> };
    expect(spec.modules["index.js"]).toContain("tools.read");
  });

  it("embeds args as a JSON literal", async () => {
    await runCode(loaderEnv(okFetch), props(), "return args.name;", { name: "value" });

    expect((loaded.mock.calls[0][0] as { modules: Record<string, string> }).modules["index.js"]).toContain(
      JSON.stringify({ name: "value" }),
    );
  });

  it("defaults args to an empty object", async () => {
    await runCode(loaderEnv(okFetch), props(), "return 1;");

    expect((loaded.mock.calls[0][0] as { modules: Record<string, string> }).modules["index.js"]).toContain("{}");
  });

  it("returns an error result rather than throwing when the worker dies", async () => {
    const env = loaderEnv(async () => {
      throw new Error("isolate exceeded memory");
    });

    const r = await runCode(env, props(), "return 1;");
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toContain("isolate exceeded memory");
  });

  it("bounds a very long failure message", async () => {
    const env = loaderEnv(async () => {
      throw new Error("x".repeat(2000));
    });

    expect(((await runCode(env, props(), "return 1;")).error ?? "").length).toBeLessThan(500);
  });

  it("passes the program failure through", async () => {
    const env = loaderEnv(async () => Response.json({ ok: false, error: "ReferenceError: x", logs: [] }));

    expect(await runCode(env, props(), "return x;")).toMatchObject({ ok: false, error: "ReferenceError: x" });
  });
});
