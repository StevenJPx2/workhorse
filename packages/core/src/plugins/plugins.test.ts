import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod/v4";
import { definePlugin } from "./define.ts";
import { PluginRegistry, isPlugin } from "./registry.ts";
import { setContext, unsetContext } from "#context";
import { DEFAULT_CONFIG } from "#config";
import type { ConfigPaths, JiratownConfig } from "#config";
import { hooks } from "#lib/hooks";
import type { Plugin } from "./types.ts";
import type { MemoryService } from "#services/memory";

// Sample plugin factory for tests
function createSamplePlugin(name: string, version = "1.0.0"): Plugin {
  return definePlugin({
    manifest: { name, version },
  });
}

// Mock memory service for tests (MemoryService requires async init)
const mockMemory = {} as MemoryService;

// Mock paths for tests
const mockPaths: ConfigPaths = {
  globalDir: "/tmp/jiratown",
  globalConfig: "/tmp/jiratown/config.toml",
  projectConfig: "/tmp/project/.jiratown.toml",
  database: "/tmp/jiratown/jiratown.db",
  memoryDatabase: "/tmp/jiratown/memory.db",
};

// Helper to create a mock context with optional config overrides
function createMockContext(configOverrides: Partial<JiratownConfig> = {}) {
  return {
    config: { ...DEFAULT_CONFIG, ...configOverrides },
    paths: mockPaths,
    hooks,
    memory: mockMemory,
  };
}

describe("isPlugin", () => {
  it("returns true for valid plugin objects", () => {
    const plugin = definePlugin({
      manifest: { name: "test", version: "1.0.0" },
    });

    expect(isPlugin(plugin)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isPlugin(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPlugin(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isPlugin("string")).toBe(false);
    expect(isPlugin(123)).toBe(false);
    expect(isPlugin(true)).toBe(false);
    expect(isPlugin(Symbol("test"))).toBe(false);
  });

  it("returns false for plain objects", () => {
    expect(isPlugin({})).toBe(false);
    expect(isPlugin({ manifest: { name: "test", version: "1.0.0" } })).toBe(false);
  });

  it("returns false for objects with wrong symbol", () => {
    const fakePlugin = {
      manifest: { name: "fake", version: "1.0.0" },
      [Symbol("other")]: true,
    };
    expect(isPlugin(fakePlugin)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isPlugin([])).toBe(false);
  });

  it("returns false for functions", () => {
    expect(isPlugin(() => {})).toBe(false);
  });
});

describe("definePlugin", () => {
  it("creates a valid plugin with required fields", () => {
    const plugin = definePlugin({
      manifest: { name: "test-plugin", version: "1.0.0" },
    });

    expect(plugin.manifest.name).toBe("test-plugin");
    expect(plugin.manifest.version).toBe("1.0.0");
    expect(Symbol.for("jiratown.plugin") in plugin).toBe(true);
  });

  it("rejects invalid manifest with empty name", () => {
    expect(() =>
      definePlugin({
        manifest: { name: "", version: "1.0.0" },
      }),
    ).toThrow();
  });

  it("rejects invalid manifest with empty version", () => {
    expect(() =>
      definePlugin({
        manifest: { name: "test", version: "" },
      }),
    ).toThrow();
  });

  it("accepts optional description", () => {
    const plugin = definePlugin({
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      },
    });

    expect(plugin.manifest.description).toBe("A test plugin");
  });

  it("accepts capabilities", () => {
    const plugin = definePlugin({
      manifest: {
        name: "test-plugin",
        version: "1.0.0",
        capabilities: {
          parsers: ["jira", "github"],
          monitors: ["jira-comments"],
        },
      },
    });

    expect(plugin.manifest.capabilities?.parsers).toEqual(["jira", "github"]);
    expect(plugin.manifest.capabilities?.monitors).toEqual(["jira-comments"]);
  });
});

describe("PluginRegistry", () => {
  // Helper to create registry bypassing the private constructor
  async function createTestRegistry(): Promise<PluginRegistry> {
    // @ts-expect-error - accessing private constructor for tests
    return new PluginRegistry();
  }

  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  describe("registration", () => {
    it("registers a valid plugin", async () => {
      const plugin = createSamplePlugin("test");
      const registry = await createTestRegistry();

      setContext(createMockContext());
      registry.register(plugin);

      expect(registry.has("test")).toBe(true);
      expect(registry.get("test")).toBe(plugin);
    });

    it("rejects duplicate plugin names", async () => {
      const plugin1 = createSamplePlugin("test");
      const plugin2 = createSamplePlugin("test");

      const registry = await createTestRegistry();
      setContext(createMockContext());

      registry.register(plugin1);
      expect(() => registry.register(plugin2)).toThrow(/already registered/);
    });

    it("emits plugin.loaded hook on register", async () => {
      const listener = vi.fn();
      hooks.on("plugin.loaded", listener);

      const plugin = createSamplePlugin("test");
      const registry = await createTestRegistry();

      setContext(createMockContext());
      registry.register(plugin);

      expect(listener).toHaveBeenCalledWith({ name: "test" });
    });
  });

  describe("list query", () => {
    it("lists all registered plugins in order", async () => {
      const plugin1 = createSamplePlugin("first");
      const plugin2 = createSamplePlugin("second");

      const registry = await createTestRegistry();
      setContext(createMockContext());

      registry.register(plugin1);
      registry.register(plugin2);

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list[0]!.manifest.name).toBe("first");
      expect(list[1]!.manifest.name).toBe("second");
    });
  });
});

describe("Plugin lifecycle", () => {
  // Helper to create registry bypassing the private constructor
  async function createTestRegistry(): Promise<PluginRegistry> {
    // @ts-expect-error - accessing private constructor for tests
    return new PluginRegistry();
  }

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

    const registry = await createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin1);
    registry.register(plugin2);

    await registry.setup();

    expect(setup1).toHaveBeenCalledOnce();
    expect(setup2).toHaveBeenCalledOnce();
  });

  it("calls teardown in reverse order", async () => {
    const order: string[] = [];

    const plugin1 = definePlugin({
      manifest: { name: "first", version: "1.0.0" },
      teardown: () => {
        order.push("first");
      },
    });

    const plugin2 = definePlugin({
      manifest: { name: "second", version: "1.0.0" },
      teardown: () => {
        order.push("second");
      },
    });

    const registry = await createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin1);
    registry.register(plugin2);

    await registry.setup();
    await registry.teardown();

    expect(order).toEqual(["second", "first"]);
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

    const registry = await createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin);

    await expect(registry.setup()).rejects.toThrow("Setup failed");
    expect(listener).toHaveBeenCalledWith({ name: "failing", error });
  });

  it("skips setup/teardown if not provided", async () => {
    const plugin = definePlugin({
      manifest: { name: "simple", version: "1.0.0" },
    });

    const registry = await createTestRegistry();

    setContext(createMockContext());
    registry.register(plugin);

    // Should not throw
    await registry.setup();
    await registry.teardown();
  });
});

describe("Plugin configSchema", () => {
  // Helper to create registry bypassing the private constructor
  async function createTestRegistry(): Promise<PluginRegistry> {
    // @ts-expect-error - accessing private constructor for tests
    return new PluginRegistry();
  }

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

    const registry = await createTestRegistry();

    // Config has matching plugin section
    setContext(
      createMockContext({
        plugins: {
          enabled: [],
          directories: [],
          jira: { cloudId: "company.atlassian.net" },
        },
      }),
    );

    registry.register(plugin);
    await registry.setup();

    expect(setupFn).toHaveBeenCalledOnce();
    expect(setupFn).toHaveBeenCalledWith({
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

    const registry = await createTestRegistry();

    // Config has invalid plugin section (empty cloudId)
    setContext(
      createMockContext({
        plugins: {
          enabled: [],
          directories: [],
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

    const registry = await createTestRegistry();

    // Config has no jira section
    setContext(createMockContext());

    registry.register(plugin);

    await expect(registry.setup()).rejects.toThrow('Invalid config for plugin "jira"');
  });

  it("calls setup without args when no configSchema", async () => {
    const setupFn = vi.fn();

    const plugin = definePlugin({
      manifest: { name: "simple", version: "1.0.0" },
      setup: setupFn,
    });

    const registry = await createTestRegistry();
    setContext(createMockContext());

    registry.register(plugin);
    await registry.setup();

    expect(setupFn).toHaveBeenCalledOnce();
    expect(setupFn).toHaveBeenCalledWith(undefined);
  });
});

it.fails("TODO: loadPlugin resolves from node_modules", async () => {
  // Test that loading a plugin by npm package name works
  const registry = await PluginRegistry.create();
  // This will fail until we have actual published plugins
  expect(registry.has("@jiratown/plugin-jira")).toBe(true);
});

it.fails("TODO: discoverPlugins finds plugins in directory", async () => {
  // Test that discover() finds plugins in .jiratown/plugins/
  const registry = await PluginRegistry.create();
  const plugins = registry.list();
  expect(plugins.length).toBeGreaterThan(0);
});
