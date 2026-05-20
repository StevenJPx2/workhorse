import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

import type { ConfigPaths, WorkhorseConfig } from "#config";
import { DEFAULT_CONFIG } from "#config";
import { setContext, unsetContext } from "#context";
import { hooks } from "#lib/hooks";

import { definePlugin } from "../define.ts";
import { PluginRegistry } from "../registry.ts";

// Helper to create registry for tests
function createTestRegistry(): PluginRegistry {
  return new PluginRegistry();
}

// Mock paths for tests
const mockPaths: ConfigPaths = {
  globalDir: "/tmp/workhorse",
  globalConfig: "/tmp/workhorse/config.toml",
  projectConfig: "/tmp/project/.workhorse.toml",
  database: "/tmp/workhorse/workhorse.db",
  memoryDatabase: "/tmp/workhorse/memory.db",
  worktreesRoot: "/tmp/project-worktrees",
  attachmentsDir: "/tmp/workhorse/attachments",
};

// Helper to create a mock context with optional config overrides
function createMockContext(configOverrides: Partial<WorkhorseConfig> = {}) {
  return {
    config: { ...DEFAULT_CONFIG, ...configOverrides },
    paths: mockPaths,
    hooks,
    // Mock services - tests don't actually use them
    db: {} as any,
    memory: {} as any,
    monitors: {} as any,
    tracker: {} as any,
    orchestrator: {
      registerTool: vi.fn(),
      getTools: vi.fn(() => []),
    } as any,
  };
}

describe("Plugin lifecycle", () => {
  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  it("calls setup on all plugins during setup()", async () => {
    const setup1 = vi.fn();
    const setup2 = vi.fn();

    const plugin1 = definePlugin({
      manifest: { name: "first", version: "1.0.0" },
      setup: setup1,
    });

    const plugin2 = definePlugin({
      manifest: { name: "second", version: "1.0.0" },
      setup: setup2,
    });

    const registry = createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin1);
    registry.register(plugin2);

    await registry.setup();

    expect(setup1).toHaveBeenCalledOnce();
    expect(setup2).toHaveBeenCalledOnce();
  });

  it("passes context to setup function", async () => {
    const setupFn = vi.fn();

    const plugin = definePlugin({
      manifest: { name: "test", version: "1.0.0" },
      setup: setupFn,
    });

    const registry = createTestRegistry();
    const mockContext = createMockContext();

    setContext(mockContext);
    registry.register(plugin);
    await registry.setup();

    expect(setupFn).toHaveBeenCalledOnce();
    // Verify the context was passed (it has hooks property)
    const passedCtx = setupFn.mock.calls[0]![0];
    expect(passedCtx).toHaveProperty("hooks");
    expect(passedCtx).toHaveProperty("config");
    expect(passedCtx).toHaveProperty("paths");
  });

  it("calls teardown in reverse order", async () => {
    const order: string[] = [];

    const plugin1 = definePlugin({
      manifest: { name: "first", version: "1.0.0" },
      setup: vi.fn(),
      teardown: () => {
        order.push("first");
      },
    });

    const plugin2 = definePlugin({
      manifest: { name: "second", version: "1.0.0" },
      setup: vi.fn(),
      teardown: () => {
        order.push("second");
      },
    });

    const registry = createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin1);
    registry.register(plugin2);

    await registry.setup();
    await registry.teardown();

    expect(order).toEqual(["second", "first"]);
  });

  it("calls teardown function without arguments", async () => {
    const teardownFn = vi.fn();

    const plugin = definePlugin({
      manifest: { name: "test", version: "1.0.0" },
      setup: vi.fn(),
      teardown: teardownFn,
    });

    const registry = createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin);
    await registry.setup();
    await registry.teardown();

    expect(teardownFn).toHaveBeenCalledOnce();
    // Teardown receives no arguments - plugins should store needed refs during setup
    expect(teardownFn.mock.calls[0]).toHaveLength(0);
  });

  it("emits plugin.error on setup failure", async () => {
    const listener = vi.fn();
    hooks.on("plugin.error", listener);

    const error = new Error("Setup failed");
    const plugin = definePlugin({
      manifest: { name: "failing", version: "1.0.0" },
      setup: () => {
        throw error;
      },
    });

    const registry = createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin);

    await expect(registry.setup()).rejects.toThrow("Setup failed");
    expect(listener).toHaveBeenCalledWith({ name: "failing", error });
  });
});

describe("Plugin configSchema", () => {
  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  it("validates and passes config to setup when configSchema is provided", async () => {
    const setupFn = vi.fn();

    const plugin = definePlugin({
      manifest: { name: "jira", version: "1.0.0" },
      configSchema: z.object({
        cloudId: z.string(),
        timeout: z.number().default(5000),
      }),
      setup: setupFn,
    });

    const registry = createTestRegistry();

    // Config has matching plugin section
    setContext(
      createMockContext({
        plugins: {
          disabled: [],
          jira: { cloudId: "company.atlassian.net" },
        },
      }),
    );

    registry.register(plugin);
    await registry.setup();

    expect(setupFn).toHaveBeenCalledOnce();
    // First arg is context, second is validated config
    const [ctx, config] = setupFn.mock.calls[0]!;
    expect(ctx).toHaveProperty("hooks");
    expect(config).toEqual({
      cloudId: "company.atlassian.net",
      timeout: 5000, // default applied
    });
  });

  it("throws on invalid plugin config", async () => {
    const plugin = definePlugin({
      manifest: { name: "jira", version: "1.0.0" },
      configSchema: z.object({
        cloudId: z.string().min(1),
      }),
      setup: vi.fn(),
    });

    const registry = createTestRegistry();

    // Config has invalid plugin section (empty cloudId)
    setContext(
      createMockContext({
        plugins: {
          disabled: [],
          jira: { cloudId: "" },
        },
      }),
    );

    registry.register(plugin);

    await expect(registry.setup()).rejects.toThrow('Invalid config for plugin "jira"');
  });

  it("throws when plugin config is missing entirely", async () => {
    const plugin = definePlugin({
      manifest: { name: "jira", version: "1.0.0" },
      configSchema: z.object({
        cloudId: z.string(),
      }),
      setup: vi.fn(),
    });

    const registry = createTestRegistry();

    // Config has no jira section
    setContext(createMockContext());

    registry.register(plugin);

    await expect(registry.setup()).rejects.toThrow('Invalid config for plugin "jira"');
  });

  it("calls setup with just context when no configSchema", async () => {
    const setupFn = vi.fn();

    const plugin = definePlugin({
      manifest: { name: "simple", version: "1.0.0" },
      setup: setupFn,
    });

    const registry = createTestRegistry();
    setContext(createMockContext());

    registry.register(plugin);
    await registry.setup();

    expect(setupFn).toHaveBeenCalledOnce();
    // Only context passed, no config
    expect(setupFn.mock.calls[0]).toHaveLength(1);
    expect(setupFn.mock.calls[0]![0]).toHaveProperty("hooks");
  });

  it("emits plugin.error when config validation fails", async () => {
    const listener = vi.fn();
    hooks.on("plugin.error", listener);

    const plugin = definePlugin({
      manifest: { name: "jira", version: "1.0.0" },
      configSchema: z.object({
        cloudId: z.string(),
      }),
      setup: vi.fn(),
    });

    const registry = createTestRegistry();
    setContext(createMockContext()); // No jira config

    registry.register(plugin);

    await expect(registry.setup()).rejects.toThrow();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0].name).toBe("jira");
  });
});
