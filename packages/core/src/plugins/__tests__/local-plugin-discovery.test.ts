import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigPaths } from "#config";
import { DEFAULT_CONFIG } from "#config";
import { setContext, unsetContext } from "#context";
import { hooks } from "#lib/hooks";
import { PluginRegistry } from "../registry.ts";

// Point to the project root where .workhorse/plugins/ exists
const PROJECT_ROOT = join(import.meta.dirname, "../../../../..");

describe("Local plugin discovery (.workhorse/plugins)", () => {
  beforeEach(() => {
    hooks.all.clear();
  });

  afterEach(() => {
    unsetContext();
    hooks.all.clear();
  });

  it("discovers hello-plugin from .workhorse/plugins/", async () => {
    // Point projectConfig to the project root so discover() finds .workhorse/plugins/
    const paths: ConfigPaths = {
      globalDir: "/tmp/workhorse",
      globalConfig: "/tmp/workhorse/config.toml", // Non-existent, won't find global plugins
      projectConfig: join(PROJECT_ROOT, ".workhorse.toml"), // This makes it look in PROJECT_ROOT/.workhorse/plugins/
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

    // Should discover hello-plugin.ts from .workhorse/plugins/
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
      projectConfig: join(PROJECT_ROOT, ".workhorse.toml"),
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

    // Check that setup() was called (it logs a message)
    expect(consoleSpy).toHaveBeenCalledWith("🎉 Hello plugin loaded from .workhorse/plugins!");

    await registry.teardown();
    expect(consoleSpy).toHaveBeenCalledWith("👋 Hello plugin teardown");

    consoleSpy.mockRestore();
  });
});
