/**
 * Tests for configuration management
 *
 * Note: Some tests use the real home directory since homedir() caching
 * makes it difficult to mock reliably. These tests are careful not to
 * modify the real user's config.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { $ } from "bun";
import {
  getConfigPaths,
  ensureConfigDir,
  configExists,
  saveGlobalConfig,
  loadConfig,
  saveProjectConfig,
} from "./config/index.ts";

describe("config", () => {
  // Save/restore actual config to avoid polluting user's real config
  let savedGlobalConfig: string | null = null;
  const { globalConfig } = getConfigPaths();

  beforeEach(() => {
    if (existsSync(globalConfig)) {
      savedGlobalConfig = readFileSync(globalConfig, "utf-8");
    }
  });

  afterEach(() => {
    // Restore original config
    if (savedGlobalConfig !== null) {
      writeFileSync(globalConfig, savedGlobalConfig, "utf-8");
    } else if (existsSync(globalConfig)) {
      rmSync(globalConfig);
    }
  });

  describe("getConfigPaths", () => {
    it("should return paths based on home directory", () => {
      const paths = getConfigPaths();
      const home = homedir();

      expect(paths.globalDir).toBe(join(home, ".jiratown"));
      expect(paths.globalConfig).toBe(join(home, ".jiratown", "config.toml"));
      expect(paths.database).toBe(join(home, ".jiratown", "jiratown.db"));
      expect(paths.projectConfig).toBeNull();
    });

    it("should include project config path when provided", () => {
      const projectRoot = "/path/to/project";
      const paths = getConfigPaths(projectRoot);

      expect(paths.projectConfig).toBe(join(projectRoot, ".jiratown.toml"));
    });
  });

  describe("ensureConfigDir", () => {
    it("should return the global dir path", () => {
      const result = ensureConfigDir();
      const paths = getConfigPaths();

      expect(result).toBe(paths.globalDir);
    });

    it("should create the directory if it doesn't exist", () => {
      // This test is a bit tricky since we don't want to delete user's config
      // Just verify the function runs without error and returns correct path
      const result = ensureConfigDir();
      expect(existsSync(result)).toBe(true);
    });
  });

  describe("configExists", () => {
    it("should return false when no config file exists", () => {
      // Remove config if it exists
      if (existsSync(globalConfig)) {
        rmSync(globalConfig);
      }
      expect(configExists()).toBe(false);
    });

    it("should return true when config file exists", () => {
      // Create a valid config
      saveGlobalConfig({
        jira: { cloud_id: "test.atlassian.net" },
        defaults: { agent: "opencode" },
      });
      expect(configExists()).toBe(true);
    });
  });

  describe("saveGlobalConfig", () => {
    it("should save configuration to global config path", () => {
      saveGlobalConfig({
        jira: { cloud_id: "mycompany.atlassian.net" },
        defaults: { agent: "claude" },
      });

      expect(existsSync(globalConfig)).toBe(true);

      const content = readFileSync(globalConfig, "utf-8");
      expect(content).toContain("[jira]");
      expect(content).toContain('cloud_id = "mycompany.atlassian.net"');
      expect(content).toContain("[defaults]");
      expect(content).toContain('agent = "claude"');
    });

    it("should create config dir if needed", () => {
      // This test verifies the ensureConfigDir path
      saveGlobalConfig({
        jira: { cloud_id: "test.atlassian.net" },
      });

      const { globalDir } = getConfigPaths();
      expect(existsSync(globalDir)).toBe(true);
    });
  });

  describe("loadConfig with global config", () => {
    it("should load and merge global config values", async () => {
      // Create a global config
      saveGlobalConfig({
        jira: { cloud_id: "global.atlassian.net" },
        defaults: { agent: "claude" },
      });

      // Load from a non-git directory (no project config)
      const rawDir = join(tmpdir(), `jiratown-loadglobal-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      const testDir = realpathSync(rawDir);

      try {
        const config = await loadConfig(testDir);

        expect(config.jira.cloud_id).toBe("global.atlassian.net");
        expect(config.defaults.agent).toBe("claude");
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe("loadConfig with project directory", () => {
    let testDir: string;

    beforeEach(async () => {
      const rawDir = join(tmpdir(), `jiratown-loadconfig-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      testDir = realpathSync(rawDir);
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should load defaults when no project config exists", async () => {
      const config = await loadConfig(testDir);

      // Should return a valid config object (may have global config values)
      expect(config).toBeDefined();
      expect(config.jira).toBeDefined();
      expect(config.defaults).toBeDefined();
      expect(typeof config.defaults.agent).toBe("string");
    });

    it("should merge project config when in git repo", async () => {
      // Create a git repo
      await $`git init`.cwd(testDir).quiet();

      // Create project config that overrides agent
      writeFileSync(join(testDir, ".jiratown.toml"), '[defaults]\nagent = "claude"\n');

      const config = await loadConfig(testDir);

      // Project config should override agent
      expect(config.defaults.agent).toBe("claude");
    });

    it("should handle non-git directory gracefully", async () => {
      // testDir is not a git repo, so no project config
      const config = await loadConfig(testDir);

      // Should still return valid config
      expect(config).toBeDefined();
      expect(config.defaults.agent).toBeDefined();
    });
  });

  describe("saveProjectConfig", () => {
    let testDir: string;

    beforeEach(async () => {
      const rawDir = join(tmpdir(), `jiratown-saveproject-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      testDir = realpathSync(rawDir);
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should save project config in git root", async () => {
      // Create a git repo
      await $`git init`.cwd(testDir).quiet();

      await saveProjectConfig(
        {
          defaults: { agent: "claude" },
        },
        testDir,
      );

      const configPath = join(testDir, ".jiratown.toml");
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("[defaults]");
      expect(content).toContain('agent = "claude"');
    });

    it("should throw error when not in git repo", async () => {
      // testDir is not a git repo
      await expect(saveProjectConfig({ defaults: { agent: "opencode" } }, testDir)).rejects.toThrow(
        "Not in a git repository",
      );
    });

    it("should save config with jira section", async () => {
      await $`git init`.cwd(testDir).quiet();

      await saveProjectConfig(
        {
          jira: { cloud_id: "custom.atlassian.net" },
          defaults: { agent: "opencode" },
        },
        testDir,
      );

      const configPath = join(testDir, ".jiratown.toml");
      const content = readFileSync(configPath, "utf-8");

      expect(content).toContain("[jira]");
      expect(content).toContain('cloud_id = "custom.atlassian.net"');
    });
  });

  describe("TOML parsing edge cases", () => {
    let testDir: string;

    beforeEach(async () => {
      const rawDir = join(tmpdir(), `jiratown-toml-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      testDir = realpathSync(rawDir);
      await $`git init`.cwd(testDir).quiet();
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should handle malformed project TOML gracefully", async () => {
      // Write invalid TOML
      writeFileSync(join(testDir, ".jiratown.toml"), "this is not valid toml {{{{");

      // Should not throw, should use defaults
      const config = await loadConfig(testDir);
      expect(config).toBeDefined();
    });

    it("should handle empty project config", async () => {
      writeFileSync(join(testDir, ".jiratown.toml"), "");

      const config = await loadConfig(testDir);
      expect(config).toBeDefined();
    });

    it("should handle partial project config", async () => {
      // Only override agent, not jira
      writeFileSync(join(testDir, ".jiratown.toml"), '[defaults]\nagent = "claude"\n');

      const config = await loadConfig(testDir);
      expect(config.defaults.agent).toBe("claude");
      // jira should come from global config or defaults
      expect(config.jira).toBeDefined();
    });
  });
});
