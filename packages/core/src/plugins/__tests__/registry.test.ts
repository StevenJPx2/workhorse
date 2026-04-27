import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigPaths, JiratownConfig } from "#config";
import { DEFAULT_CONFIG } from "#config";
import { setContext, unsetContext } from "#context";
import { hooks } from "#lib/hooks";
import { definePlugin } from "../define.ts";
import { isPlugin, PluginRegistry } from "../registry.ts";
import type { Plugin } from "../types.ts";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");

// Sample plugin factory for tests
function createSamplePlugin(name: string, version = "1.0.0"): Plugin {
  // @ts-expect-error - testing minimal plugin without setup (type requires setup)
  return definePlugin({
    manifest: { name, version },
  });
}

// Mock paths for tests
const mockPaths: ConfigPaths = {
  globalDir: "/tmp/jiratown",
  globalConfig: "/tmp/jiratown/config.toml",
  projectConfig: "/tmp/project/.jiratown.toml",
  database: "/tmp/jiratown/jiratown.db",
  memoryDatabase: "/tmp/jiratown/memory.db",
  worktreesRoot: "/tmp/project-worktrees",
};

// Helper to create a mock context with optional config overrides
function createMockContext(configOverrides: Partial<JiratownConfig> = {}) {
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

describe("isPlugin", () => {
  it("returns true for valid plugin objects", () => {
    // @ts-expect-error - testing minimal plugin without setup (type requires setup)
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

describe("PluginRegistry", () => {
  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  describe("registration", () => {
    it("registers a valid plugin", () => {
      const plugin = createSamplePlugin("test");
      const registry = new PluginRegistry();

      setContext(createMockContext());
      registry.register(plugin);

      expect(registry.has("test")).toBe(true);
      expect(registry.get("test")).toBe(plugin);
    });

    it("rejects duplicate plugin names", () => {
      const plugin1 = createSamplePlugin("test");
      const plugin2 = createSamplePlugin("test");

      const registry = new PluginRegistry();
      setContext(createMockContext());

      registry.register(plugin1);
      expect(() => registry.register(plugin2)).toThrow(/already registered/);
    });

    it("emits plugin.loaded hook on register", () => {
      const listener = vi.fn();
      hooks.on("plugin.loaded", listener);

      const plugin = createSamplePlugin("test");
      const registry = new PluginRegistry();

      setContext(createMockContext());
      registry.register(plugin);

      expect(listener).toHaveBeenCalledWith({ name: "test" });
    });
  });

  describe("list query", () => {
    it("lists all registered plugins in order", () => {
      const plugin1 = createSamplePlugin("first");
      const plugin2 = createSamplePlugin("second");

      const registry = new PluginRegistry();
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

describe("PluginRegistry.create", () => {
  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  it("loads plugins from enabled list by path", async () => {
    const validPluginPath = join(FIXTURES_DIR, "plugins", "valid-plugin.ts");
    setContext(
      createMockContext({
        plugins: { enabled: [validPluginPath] },
      }),
    );

    const registry = await PluginRegistry.create();
    expect(registry.has("valid-fixture-plugin")).toBe(true);
  });

  it("throws when loading an invalid plugin from enabled list", async () => {
    const invalidPluginPath = join(FIXTURES_DIR, "plugins", "invalid-plugin.ts");
    setContext(
      createMockContext({
        plugins: { enabled: [invalidPluginPath] },
      }),
    );

    await expect(PluginRegistry.create()).rejects.toThrow(/not a valid plugin/);
  });

  it("skips duplicate plugins and logs warning", async () => {
    const validPluginPath = join(FIXTURES_DIR, "plugins", "valid-plugin.ts");
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    setContext(
      createMockContext({
        plugins: {
          enabled: [validPluginPath, validPluginPath],
        },
      }),
    );

    const registry = await PluginRegistry.create();
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("already registered"));

    consoleSpy.mockRestore();
  });

  it("discovers plugins from directory with file plugins", async () => {
    // Point globalConfig to fixtures directory so discover() looks there
    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalConfig: join(FIXTURES_DIR, "config.toml"),
      projectConfig: "/tmp/no-plugins/.jiratown.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { enabled: [] } },
      paths: pathsWithFixtures,
      hooks,
      db: {} as any,
      memory: {} as any,
      monitors: {} as any,
      tracker: {} as any,
      orchestrator: {
        registerTool: vi.fn(),
        getTools: vi.fn(() => []),
      } as any,
    });

    const registry = await PluginRegistry.create();

    // Should discover valid-plugin.ts and directory-plugin/index.ts
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    expect(registry.has("directory-plugin")).toBe(true);
  });

  it("skips files with invalid extensions during discovery", async () => {
    // Create a context where discover() will find our fixtures dir
    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalConfig: join(FIXTURES_DIR, "config.toml"),
      projectConfig: "/tmp/no-plugins/.jiratown.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { enabled: [] } },
      paths: pathsWithFixtures,
      hooks,
      db: {} as any,
      memory: {} as any,
      monitors: {} as any,
      tracker: {} as any,
      orchestrator: {
        registerTool: vi.fn(),
        getTools: vi.fn(() => []),
      } as any,
    });

    const registry = await PluginRegistry.create();

    // Should have discovered the valid ones
    expect(registry.list().length).toBeGreaterThan(0);
  });

  it("logs warning and skips invalid plugins during discovery", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalConfig: join(FIXTURES_DIR, "config.toml"),
      projectConfig: "/tmp/no-plugins/.jiratown.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { enabled: [] } },
      paths: pathsWithFixtures,
      hooks,
      db: {} as any,
      memory: {} as any,
      monitors: {} as any,
      tracker: {} as any,
      orchestrator: {
        registerTool: vi.fn(),
        getTools: vi.fn(() => []),
      } as any,
    });

    const registry = await PluginRegistry.create();

    // Should have discovered valid plugins but skipped invalid-plugin.ts
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    // Invalid plugin should be skipped with a warning
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid plugin"));

    consoleSpy.mockRestore();
  });

  it("handles non-existent plugin directories gracefully", async () => {
    setContext(createMockContext({ plugins: { enabled: [] } }));

    // Should not throw even though /tmp/jiratown/plugins doesn't exist
    const registry = await PluginRegistry.create();
    expect(registry.list()).toHaveLength(0);
  });

  it("loads plugin with named export (no default export)", async () => {
    // The named-export-plugin.ts exports `plugin` not `default`
    // This tests the `mod.default ?? mod` branch
    const namedPluginPath = join(FIXTURES_DIR, "plugins", "named-export-plugin.ts");
    setContext(
      createMockContext({
        plugins: { enabled: [namedPluginPath] },
      }),
    );

    // Should fail because named export without default is not directly usable
    // The plugin is exported as `plugin` not as default
    await expect(PluginRegistry.create()).rejects.toThrow(/not a valid plugin/);
  });

  it("skips directories without index.ts during discovery", async () => {
    // The fixtures/plugins directory has an empty-dir/ without index.ts
    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalConfig: join(FIXTURES_DIR, "config.toml"),
      projectConfig: "/tmp/no-plugins/.jiratown.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { enabled: [] } },
      paths: pathsWithFixtures,
      hooks,
      db: {} as any,
      memory: {} as any,
      monitors: {} as any,
      tracker: {} as any,
      orchestrator: {
        registerTool: vi.fn(),
        getTools: vi.fn(() => []),
      } as any,
    });

    const registry = await PluginRegistry.create();

    // Should not have loaded empty-dir since it has no index.ts
    // We know valid-plugin and directory-plugin should be loaded
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    expect(registry.has("directory-plugin")).toBe(true);
    // Total should be 2 (not counting empty-dir or readme.md)
    expect(registry.list().length).toBe(2);
  });
});

it.fails("TODO: create resolves from node_modules", async () => {
  // Test that loading a plugin by npm package name works
  setContext(createMockContext());
  const registry = await PluginRegistry.create();
  // This will fail until we have actual published plugins
  expect(registry.has("@jiratown/plugin-jira")).toBe(true);
});
