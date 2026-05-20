import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigPaths } from "#config";
import { DEFAULT_CONFIG } from "#config";
import { setContext, unsetContext } from "#context";
import { hooks } from "#lib/hooks";

import { PluginRegistry } from "../registry.ts";

// Use a temp directory for test plugins
const TEST_PROJECT_DIR = join(import.meta.dirname, "fixtures", "temp-project");
const TEST_WORKHORSE_PLUGINS = join(TEST_PROJECT_DIR, ".workhorse", "plugins");

// Plugin source code that imports definePlugin using a path relative to its location
// From fixtures/temp-project/.workhorse/plugins/ -> ../../define.ts goes to fixtures/define.ts (wrong)
// We need to go up to src/plugins/define.ts which is 5 levels up
const HELLO_PLUGIN_SOURCE = `
import { definePlugin } from "../../../../../define.ts";

export default definePlugin({
  manifest: {
    name: "hello-plugin",
    version: "1.0.0",
    description: "A test local plugin",
  },
  setup(ctx) {
    console.log("🎉 Hello plugin loaded from .workhorse/plugins!");
    ctx.hooks.on("plugin.loaded", ({ name }) => {
      if (name === "hello-plugin") {
        console.log("✅ Hello plugin confirmed working!");
      }
    });
  },
  teardown() {
    console.log("👋 Hello plugin teardown");
  },
});
`;

describe("Local plugin discovery (.workhorse/plugins)", () => {
  beforeAll(() => {
    // Create temp plugin directory structure
    mkdirSync(TEST_WORKHORSE_PLUGINS, { recursive: true });
    writeFileSync(join(TEST_WORKHORSE_PLUGINS, "hello-plugin.ts"), HELLO_PLUGIN_SOURCE);
  });

  afterAll(() => {
    // Clean up temp directories
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  it("discovers hello-plugin from .workhorse/plugins/", async () => {
    const paths: ConfigPaths = {
      globalDir: "/tmp/workhorse",
      globalConfig: "/tmp/workhorse/config.toml",
      projectConfig: join(TEST_PROJECT_DIR, ".workhorse.toml"),
      database: "/tmp/workhorse/workhorse.db",
      memoryDatabase: "/tmp/workhorse/memory.db",
      worktreesRoot: "/tmp/project-worktrees",
      attachmentsDir: "/tmp/workhorse/attachments",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { disabled: [] } },
      paths,
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

    expect(registry.has("hello-plugin")).toBe(true);

    const plugin = registry.get("hello-plugin");
    expect(plugin?.manifest.version).toBe("1.0.0");
    expect(plugin?.manifest.description).toBe("A test local plugin");
  });

  it("runs setup() and teardown() lifecycle methods", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const paths: ConfigPaths = {
      globalDir: "/tmp/workhorse",
      globalConfig: "/tmp/workhorse/config.toml",
      projectConfig: join(TEST_PROJECT_DIR, ".workhorse.toml"),
      database: "/tmp/workhorse/workhorse.db",
      memoryDatabase: "/tmp/workhorse/memory.db",
      worktreesRoot: "/tmp/project-worktrees",
      attachmentsDir: "/tmp/workhorse/attachments",
    };

    setContext({
      config: { ...DEFAULT_CONFIG, plugins: { disabled: [] } },
      paths,
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
    await registry.setup();

    expect(consoleSpy).toHaveBeenCalledWith("🎉 Hello plugin loaded from .workhorse/plugins!");

    await registry.teardown();
    expect(consoleSpy).toHaveBeenCalledWith("👋 Hello plugin teardown");

    consoleSpy.mockRestore();
  });
});
