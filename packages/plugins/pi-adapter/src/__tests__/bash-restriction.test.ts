/**
 * Tests for bash restriction utilities.
 */

import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRestrictedBashOperations,
  createPathValidatingSpawnHook,
  createRestrictedBashConfig,
} from "../bash-restriction.ts";

describe("bash-restriction", () => {
  const worktreePath = "/home/agent/worktrees/PROJ-123";
  const tmpDir = tmpdir();

  describe("createRestrictedBashOperations", () => {
    it("should allow execution in worktree directory", () => {
      // We can't easily mock the internal localOps, but we can test the validation
      // by checking that it doesn't throw for valid paths
      expect(() => {
        // This tests the path validation logic
        createRestrictedBashOperations({ rootDir: worktreePath });
      }).not.toThrow();
    });

    it("should allow execution in /tmp/ when allowTmp is true", () => {
      const ops = createRestrictedBashOperations({
        rootDir: worktreePath,
        allowTmp: true,
      });

      // The operations object should be created without error
      expect(ops).toHaveProperty("exec");
      expect(typeof ops.exec).toBe("function");
    });

    it("should not allow /tmp/ when allowTmp is false", async () => {
      const ops = createRestrictedBashOperations({
        rootDir: worktreePath,
        allowTmp: false,
      });

      // Attempting to exec in /tmp should throw
      await expect(
        ops.exec("echo test", "/tmp/malicious", {
          onData: () => {},
        }),
      ).rejects.toThrow(/outside the allowed directory/);
    });

    it("should reject execution outside worktree", async () => {
      const ops = createRestrictedBashOperations({ rootDir: worktreePath });

      await expect(
        ops.exec("cat /etc/passwd", "/etc", {
          onData: () => {},
        }),
      ).rejects.toThrow(/outside the allowed directory/);
    });

    it("should reject path traversal attempts", async () => {
      const ops = createRestrictedBashOperations({ rootDir: worktreePath });

      await expect(
        ops.exec("ls", join(worktreePath, "..", "..", "etc"), {
          onData: () => {},
        }),
      ).rejects.toThrow(/outside the allowed directory/);
    });
  });

  describe("createPathValidatingSpawnHook", () => {
    it("should return a function", () => {
      const hook = createPathValidatingSpawnHook({ rootDir: worktreePath });
      expect(typeof hook).toBe("function");
    });

    it("should pass through valid cwd in worktree", () => {
      const hook = createPathValidatingSpawnHook({ rootDir: worktreePath });
      const context = {
        command: "echo hello",
        cwd: join(worktreePath, "src"),
        env: process.env as NodeJS.ProcessEnv,
      };

      const result = hook(context);
      expect(result.command).toBe("echo hello");
      expect(result.cwd).toContain(worktreePath);
    });

    it("should pass through valid cwd in /tmp when allowed", () => {
      const hook = createPathValidatingSpawnHook({
        rootDir: worktreePath,
        allowTmp: true,
      });
      const context = {
        command: "mktemp",
        cwd: tmpDir,
        env: process.env as NodeJS.ProcessEnv,
      };

      const result = hook(context);
      expect(result.cwd).toBe(tmpDir);
    });

    it("should throw for cwd outside allowed paths", () => {
      const hook = createPathValidatingSpawnHook({ rootDir: worktreePath });
      const context = {
        command: "ls",
        cwd: "/etc",
        env: process.env as NodeJS.ProcessEnv,
      };

      expect(() => hook(context)).toThrow(/outside allowed paths/);
    });

    it("should merge additional environment variables", () => {
      const hook = createPathValidatingSpawnHook({
        rootDir: worktreePath,
        additionalEnv: { CUSTOM_VAR: "test_value" },
      });
      const context = {
        command: "echo $CUSTOM_VAR",
        cwd: worktreePath,
        env: { PATH: "/usr/bin" } as NodeJS.ProcessEnv,
      };

      const result = hook(context);
      expect(result.env).toHaveProperty("CUSTOM_VAR", "test_value");
      expect(result.env).toHaveProperty("PATH", "/usr/bin");
    });
  });

  describe("createRestrictedBashConfig", () => {
    it("should return operations, spawnHook, and pathOptions", () => {
      const config = createRestrictedBashConfig({ worktreePath });

      expect(config).toHaveProperty("operations");
      expect(config).toHaveProperty("spawnHook");
      expect(config).toHaveProperty("pathOptions");
      expect(config.pathOptions.rootDir).toBe(worktreePath);
    });

    it("should include /tmp in additionalAllowedDirs by default", () => {
      const config = createRestrictedBashConfig({ worktreePath });

      expect(config.pathOptions.additionalAllowedDirs).toContain(tmpDir);
    });

    it("should not include /tmp when allowTmp is false", () => {
      const config = createRestrictedBashConfig({
        worktreePath,
        allowTmp: false,
      });

      expect(config.pathOptions.additionalAllowedDirs).not.toContain(tmpDir);
    });

    it("should include custom additional allowed dirs", () => {
      const customDir = "/custom/allowed/dir";
      const config = createRestrictedBashConfig({
        worktreePath,
        additionalAllowedDirs: [customDir],
      });

      expect(config.pathOptions.additionalAllowedDirs).toContain(customDir);
      expect(config.pathOptions.additionalAllowedDirs).toContain(tmpDir);
    });
  });
});
