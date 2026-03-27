/**
 * Tests for git rig detection
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import {
  normalizeRemoteUrl,
  getGitRoot,
  getRemoteUrl,
  detectRig,
} from "./detect-rig.ts";

describe("detect-rig", () => {
  describe("normalizeRemoteUrl", () => {
    it("should normalize SSH git@ URLs", () => {
      expect(normalizeRemoteUrl("git@github.com:user/repo.git")).toBe(
        "github.com/user/repo"
      );
      expect(normalizeRemoteUrl("git@github.com:user/repo")).toBe(
        "github.com/user/repo"
      );
      expect(normalizeRemoteUrl("git@gitlab.com:org/project.git")).toBe(
        "gitlab.com/org/project"
      );
    });

    it("should normalize HTTPS URLs", () => {
      expect(normalizeRemoteUrl("https://github.com/user/repo.git")).toBe(
        "github.com/user/repo"
      );
      expect(normalizeRemoteUrl("https://github.com/user/repo")).toBe(
        "github.com/user/repo"
      );
      expect(normalizeRemoteUrl("https://gitlab.com/org/project.git")).toBe(
        "gitlab.com/org/project"
      );
    });

    it("should normalize HTTP URLs", () => {
      expect(normalizeRemoteUrl("http://github.com/user/repo.git")).toBe(
        "github.com/user/repo"
      );
      expect(normalizeRemoteUrl("http://github.com/user/repo")).toBe(
        "github.com/user/repo"
      );
    });

    it("should normalize ssh:// URLs", () => {
      expect(normalizeRemoteUrl("ssh://git@github.com/user/repo.git")).toBe(
        "github.com/user/repo"
      );
      expect(normalizeRemoteUrl("ssh://git@github.com/user/repo")).toBe(
        "github.com/user/repo"
      );
    });

    it("should trim whitespace", () => {
      expect(normalizeRemoteUrl("  git@github.com:user/repo.git  ")).toBe(
        "github.com/user/repo"
      );
    });
  });

  describe("getGitRoot", () => {
    let testDir: string;

    beforeEach(async () => {
      const rawDir = join(tmpdir(), `jiratown-git-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      // Resolve symlinks (macOS /var -> /private/var)
      testDir = realpathSync(rawDir);
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should return null for non-git directory", async () => {
      const result = await getGitRoot(testDir);
      expect(result).toBeNull();
    });

    it("should return git root for git repository", async () => {
      // Initialize a git repo
      await $`git init`.cwd(testDir).quiet();

      const result = await getGitRoot(testDir);
      expect(result).toBe(testDir);
    });

    it("should return git root from subdirectory", async () => {
      // Initialize a git repo
      await $`git init`.cwd(testDir).quiet();

      // Create a subdirectory
      const subDir = join(testDir, "src", "components");
      mkdirSync(subDir, { recursive: true });

      const result = await getGitRoot(subDir);
      expect(result).toBe(testDir);
    });
  });

  describe("getRemoteUrl", () => {
    let testDir: string;

    beforeEach(async () => {
      const rawDir = join(tmpdir(), `jiratown-remote-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      // Resolve symlinks (macOS /var -> /private/var)
      testDir = realpathSync(rawDir);
      await $`git init`.cwd(testDir).quiet();
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should return null when no remote exists", async () => {
      const result = await getRemoteUrl(testDir);
      expect(result).toBeNull();
    });

    it("should return remote URL when origin exists", async () => {
      // Add a remote
      await $`git remote add origin https://github.com/test/repo.git`
        .cwd(testDir)
        .quiet();

      const result = await getRemoteUrl(testDir);
      expect(result).toBe("https://github.com/test/repo.git");
    });

    it("should support custom remote names", async () => {
      // Add a custom remote
      await $`git remote add upstream https://github.com/upstream/repo.git`
        .cwd(testDir)
        .quiet();

      const result = await getRemoteUrl(testDir, "upstream");
      expect(result).toBe("https://github.com/upstream/repo.git");
    });
  });

  describe("detectRig", () => {
    let testDir: string;

    beforeEach(async () => {
      const rawDir = join(tmpdir(), `jiratown-rig-test-${Date.now()}`);
      mkdirSync(rawDir, { recursive: true });
      // Resolve symlinks (macOS /var -> /private/var)
      testDir = realpathSync(rawDir);
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should return null for non-git directory", async () => {
      const result = await detectRig(testDir);
      expect(result).toBeNull();
    });

    it("should return null for git repo without remote", async () => {
      await $`git init`.cwd(testDir).quiet();

      const result = await detectRig(testDir);
      expect(result).toBeNull();
    });

    it("should return rig info for git repo with remote", async () => {
      await $`git init`.cwd(testDir).quiet();
      await $`git remote add origin git@github.com:testorg/testrepo.git`
        .cwd(testDir)
        .quiet();

      const result = await detectRig(testDir);

      expect(result).not.toBeNull();
      expect(result!.rig).toBe("github.com/testorg/testrepo");
      expect(result!.gitRoot).toBe(testDir);
      expect(result!.remoteUrl).toBe("git@github.com:testorg/testrepo.git");
    });
  });
});
