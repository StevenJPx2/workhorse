import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigPaths, WorkhorseConfig } from "#config";
import { DEFAULT_CONFIG } from "#config";
import { setContext, unsetContext } from "#context";
import { hooks } from "#lib";

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

    it("skips plugins in the disabled list", () => {
      const plugin = createSamplePlugin("disabled-plugin");
      const registry = new PluginRegistry();

      setContext(
        createMockContext({
          plugins: { disabled: ["disabled-plugin"] },
        }),
      );
      registry.register(plugin);

      expect(registry.has("disabled-plugin")).toBe(false);
    });

    it("does not emit plugin.loaded for disabled plugins", () => {
      const listener = vi.fn();
      hooks.on("plugin.loaded", listener);

      const plugin = createSamplePlugin("disabled-plugin");
      const registry = new PluginRegistry();

      setContext(
        createMockContext({
          plugins: { disabled: ["disabled-plugin"] },
        }),
      );
      registry.register(plugin);

      expect(listener).not.toHaveBeenCalled();
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

describe("PluginRegistry.discoverCustomPlugins", () => {
  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  it("discovers plugins from directory with file plugins", async () => {
    // Point globalDir to fixtures directory so discover() looks at FIXTURES_DIR/plugins
    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalDir: FIXTURES_DIR,
      projectConfig: "/tmp/no-plugins/.workhorse.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { disabled: [] } },
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

    const registry = new PluginRegistry();
    await registry.discoverCustomPlugins();

    // Should discover valid-plugin.ts and directory-plugin/index.ts
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    expect(registry.has("directory-plugin")).toBe(true);
  });

  it("skips files with invalid extensions during discovery", async () => {
    // Create a context where discover() will find our fixtures dir
    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalDir: FIXTURES_DIR,
      projectConfig: "/tmp/no-plugins/.workhorse.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { disabled: [] } },
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

    const registry = new PluginRegistry();
    await registry.discoverCustomPlugins();

    // Should have discovered the valid ones
    expect(registry.list().length).toBeGreaterThan(0);
  });

  it("logs warning and skips invalid plugins during discovery", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalDir: FIXTURES_DIR,
      projectConfig: "/tmp/no-plugins/.workhorse.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { disabled: [] } },
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

    const registry = new PluginRegistry();
    await registry.discoverCustomPlugins();

    // Should have discovered valid plugins but skipped invalid-plugin.ts
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    // Invalid plugin should be skipped with a warning
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid plugin"));

    consoleSpy.mockRestore();
  });

  it("handles non-existent plugin directories gracefully", async () => {
    setContext(createMockContext({ plugins: { disabled: [] } }));

    const registry = new PluginRegistry();
    // Should not throw even though /tmp/workhorse/plugins doesn't exist
    await registry.discoverCustomPlugins();
    expect(registry.list()).toHaveLength(0);
  });

  it("skips directories without index.ts during discovery", async () => {
    // The fixtures/plugins directory has an empty-dir/ without index.ts
    const pathsWithFixtures: ConfigPaths = {
      ...mockPaths,
      globalDir: FIXTURES_DIR,
      projectConfig: "/tmp/no-plugins/.workhorse.toml",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { disabled: [] } },
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

    const registry = new PluginRegistry();
    await registry.discoverCustomPlugins();

    // Should not have loaded empty-dir since it has no index.ts
    // We know valid-plugin and directory-plugin should be loaded
    expect(registry.has("valid-fixture-plugin")).toBe(true);
    expect(registry.has("directory-plugin")).toBe(true);
    // Total should be 2 (not counting empty-dir or readme.md)
    expect(registry.list().length).toBe(2);
  });
});
