import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHooks } from "hookable";

import { ResolvedConfig } from "#config";
import type { Hooks } from "#hooks";
import type { WorkflowContext } from "#workflow";

import { McpService } from "../service";

function context(cwd = "/tmp/wt"): WorkflowContext {
  return {
    config: ResolvedConfig.parse({}),
    cwd,
    hooks: createHooks<Hooks>(),
  };
}

function mockServerConfig(name: string): {
  args: string[];
  command: string;
  name: string;
} {
  return {
    args: [fileURLToPath(import.meta.resolve("./server.ts"))],
    command: "bun",
    name,
  };
}

function createService(): McpService {
  return new McpService([mockServerConfig("mock")]);
}

async function setupRecorder(ctx: WorkflowContext) {
  const registered: { tools: unknown[] }[] = [];
  ctx.hooks.hook("tools:register", (payload) => {
    registered.push(payload);
  });

  return { registered };
}

describe("McpService setup", () => {
  let service = createService();

  beforeEach(() => {
    service = createService();
  });

  afterEach(async () => {
    service.teardown();
    vi.restoreAllMocks();
  });

  it("registers namespaced MCP tools on setup", async () => {
    const ctx = context();
    const { registered } = await setupRecorder(ctx);

    await service.setup(ctx);

    expect(registered).toHaveLength(1);
    const names = registered[0]?.tools.map(
      (tool) => (tool as { name: string }).name,
    );
    expect(names).toEqual(["mcp:mock:echo"]);
  });
});

describe("McpService tool execution", () => {
  let service = createService();

  beforeEach(() => {
    service = createService();
  });

  afterEach(async () => {
    service.teardown();
    vi.restoreAllMocks();
  });

  it("exposes an MCP tool that can be executed", async () => {
    const ctx = context();
    const { registered } = await setupRecorder(ctx);

    await service.setup(ctx);

    const echo = registered[0]?.tools.find(
      (tool) => (tool as { name: string }).name === "mcp:mock:echo",
    ) as
      | { execute: (args: unknown, ctx: WorkflowContext) => Promise<unknown> }
      | undefined;

    expect(echo).toBeDefined();

    const result = await echo?.execute({ message: "hi" }, ctx);
    expect(result).toEqual({
      ok: true,
      output: expect.stringContaining('"type": "text"'),
    });
    expect(JSON.parse((result as { output: string }).output)).toEqual({
      content: [{ text: "hi", type: "text" }],
    });
  });
});

describe("McpService runtime registration", () => {
  let service = createService();

  beforeEach(() => {
    service = createService();
  });

  afterEach(async () => {
    service.teardown();
    vi.restoreAllMocks();
  });

  it("registers tools for servers added via mcp:register", async () => {
    const ctx = context();
    const { registered } = await setupRecorder(ctx);

    await service.setup(ctx);
    await ctx.hooks.callHook("mcp:register", {
      server: mockServerConfig("dynamic"),
    });

    const last = registered
      .at(-1)
      ?.tools.map((tool) => (tool as { name: string }).name);
    expect(last).toContain("mcp:dynamic:echo");
  });
});
