/**
 * Tests for useConfig hook
 */

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { createRoot } from "solid-js";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { useConfig } from "./use-config.ts";

describe("useConfig", () => {
  // Use a test-specific config directory
  const testConfigDir = join(tmpdir(), ".jiratown-test-" + Date.now());
  const originalHome = process.env.HOME;

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }
    // Point HOME to test directory so config.ts uses it
    process.env.HOME = tmpdir();
  });

  afterEach(() => {
    // Restore HOME
    process.env.HOME = originalHome;
    // Clean up test directory
    try {
      rmSync(testConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("initial state", () => {
    it("should start idle without autoLoad", () => {
      createRoot((dispose) => {
        const { status, config, error } = useConfig();
        expect(status()).toBe("idle");
        expect(config()).toBeNull();
        expect(error()).toBeNull();
        dispose();
      });
    });
  });

  describe("load", () => {
    it("should load config and update status", async () => {
      await createRoot(async (dispose) => {
        const { status, config, load } = useConfig();
        expect(status()).toBe("idle");

        const result = await load();

        expect(status()).toBe("loaded");
        expect(config()).not.toBeNull();
        expect(result).toEqual(config()!);
        dispose();
      });
    });

    it("should call onLoad callback", async () => {
      await createRoot(async (dispose) => {
        const onLoad = mock(() => {});
        const { load } = useConfig({ onLoad });

        await load();

        expect(onLoad).toHaveBeenCalledTimes(1);
        dispose();
      });
    });
  });

  describe("derived accessors", () => {
    it("should return default values when config not loaded", () => {
      createRoot((dispose) => {
        const { theme, agent, cloudId } = useConfig();
        expect(theme()).toBe("tokyonight");
        expect(agent()).toBe("opencode");
        expect(cloudId()).toBe("");
        dispose();
      });
    });

    it("should return config values when loaded", async () => {
      await createRoot(async (dispose) => {
        const { theme, agent, cloudId, load } = useConfig();

        await load();

        // Should return loaded values (or defaults if no config file)
        expect(typeof theme()).toBe("string");
        expect(["opencode", "claude"]).toContain(agent());
        expect(typeof cloudId()).toBe("string");
        dispose();
      });
    });
  });

  describe("saveGlobal", () => {
    it("should update local state after save", () => {
      createRoot((dispose) => {
        const { theme, saveGlobal, load } = useConfig();

        // First load defaults
        load();

        // Save new config
        saveGlobal({
          ui: { theme: "gruvbox" },
        });

        expect(theme()).toBe("gruvbox");
        dispose();
      });
    });

    it("should preserve existing values when saving partial config", () => {
      createRoot((dispose) => {
        const { theme, agent, cloudId, saveGlobal, load } = useConfig();

        // First load defaults
        load();

        // Save only jira config - should preserve defaults
        saveGlobal({
          jira: { cloud_id: "test.atlassian.net" },
        });

        expect(cloudId()).toBe("test.atlassian.net");
        // Theme and agent should be preserved from defaults
        expect(theme()).toBe("tokyonight");
        expect(agent()).toBe("opencode");
        dispose();
      });
    });

    it("should update agent setting", () => {
      createRoot((dispose) => {
        const { agent, saveGlobal, load } = useConfig();

        load();

        saveGlobal({
          defaults: { agent: "claude" },
        });

        expect(agent()).toBe("claude");
        dispose();
      });
    });
  });

  describe("autoLoad", () => {
    it("should auto-load when autoLoad is true", async () => {
      await createRoot(async (dispose) => {
        const onLoad = mock(() => {});
        useConfig({ autoLoad: true, onLoad });

        // Give it a moment for async load
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(onLoad).toHaveBeenCalled();
        dispose();
      });
    });
  });

  describe("setTheme", () => {
    it("should update theme and persist", async () => {
      await createRoot(async (dispose) => {
        const { theme, setTheme, load } = useConfig();

        await load();
        expect(theme()).toBe("tokyonight");

        await setTheme("gruvbox");
        expect(theme()).toBe("gruvbox");

        dispose();
      });
    });
  });
});
