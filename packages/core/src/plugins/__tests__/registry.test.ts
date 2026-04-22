import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { definePlugin } from "../define.ts";
import { PluginRegistry, isPlugin } from "../registry.ts";
import { setContext, unsetContext } from "#context";
import { DEFAULT_CONFIG } from "#config";
import type { ConfigPaths, JiratownConfig } from "#config";
import { hooks } from "#lib/hooks";
import type { Plugin } from "../types.ts";

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
};

// Helper to create a mock context with optional config overrides
function createMockContext(configOverrides: Partial<JiratownConfig> = {}) {
  return {
    config: { ...DEFAULT_CONFIG, ...configOverrides },
    paths: mockPaths,
    hooks,
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

it.fails("TODO: loadPlugins resolves from node_modules", async () => {
  // Test that loading a plugin by npm package name works
  setContext(createMockContext());
  const registry = new PluginRegistry();
  await registry.loadPlugins();
  // This will fail until we have actual published plugins
  expect(registry.has("@jiratown/plugin-jira")).toBe(true);
});

it.fails("TODO: loadPlugins finds plugins in directory", async () => {
  // Test that loadPlugins() finds plugins in .jiratown/plugins/
  setContext(createMockContext());
  const registry = new PluginRegistry();
  await registry.loadPlugins();
  const plugins = registry.list();
  expect(plugins.length).toBeGreaterThan(0);
});
