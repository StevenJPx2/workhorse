import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigPaths } from "#config";
import type { HookEmitter } from "#lib";
import { createMockHooks } from "#test-helpers";

import { SkillRegistry } from "../skills";

function createTestPaths(tempDir: string): ConfigPaths {
  const globalDir = join(tempDir, "global"),
    projectDir = join(tempDir, "project");
  return {
    globalDir,
    globalConfig: join(globalDir, "config.ts"),
    projectConfig: join(projectDir, "workhorse.config.ts"),
    database: join(globalDir, "db.sqlite"),
    memoryDatabase: join(globalDir, "memory.sqlite"),
    worktreesRoot: join(tempDir, "worktrees"),
    attachmentsDir: join(tempDir, "attachments"),
  };
}

describe("SkillRegistry", () => {
  let registry: SkillRegistry;
  let hooks: HookEmitter;
  let tempDir: string;

  beforeEach(() => {
    hooks = createMockHooks();
    registry = new SkillRegistry(hooks);
    tempDir = mkdtempSync(join(tmpdir(), "skills-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("registerSkill", () => {
    it("registers a skill with inline instructions", () => {
      registry.registerSkill({
        id: "test:my-skill",
        name: "My Skill",
        description: "A test skill",
        instructions: "Do the thing",
      });

      const skill = registry.getSkill("test:my-skill");
      expect(skill).toBeDefined();
      expect(skill?.name).toBe("My Skill");
      expect(skill?.instructions).toBe("Do the thing");
    });

    it("emits skill.registered hook", () => {
      const handler = vi.fn();
      hooks.on("skill.registered", handler);

      registry.registerSkill({
        id: "test:my-skill",
        name: "My Skill",
        description: "A test skill",
        instructions: "Do the thing",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        skill: expect.objectContaining({ id: "test:my-skill" }),
      });
    });

    it("throws if skill ID is already registered", () => {
      registry.registerSkill({
        id: "test:my-skill",
        name: "My Skill",
        description: "A test skill",
        instructions: "Do the thing",
      });
      expect(() =>
        registry.registerSkill({
          id: "test:my-skill",
          name: "Another Skill",
          description: "Another description",
          instructions: "Do another thing",
        }),
      ).toThrow('Skill "test:my-skill" already registered');
    });

    it("loads instructions from file when instructionsPath is provided", () => {
      const skillContent = "## Instructions\n\n1. Step one\n2. Step two";
      const skillFile = join(tempDir, "my-skill.md");
      writeFileSync(skillFile, skillContent);

      registry.setCurrentPluginPath(tempDir);

      registry.registerSkill({
        id: "test:my-skill",
        name: "My Skill",
        description: "A test skill",
        instructionsPath: "my-skill.md",
      });

      const skill = registry.getSkill("test:my-skill");
      expect(skill?.instructions).toBe(skillContent);
    });

    it("throws if instructionsPath file not found", () => {
      registry.setCurrentPluginPath(tempDir);

      expect(() =>
        registry.registerSkill({
          id: "test:my-skill",
          name: "My Skill",
          description: "A test skill",
          instructionsPath: "nonexistent.md",
        }),
      ).toThrow(/Failed to load skill file/);
    });

    it("throws if no plugin path set when using instructionsPath", () => {
      expect(() =>
        registry.registerSkill({
          id: "test:my-skill",
          name: "My Skill",
          description: "A test skill",
          instructionsPath: "my-skill.md",
        }),
      ).toThrow("Cannot load skill file: no plugin path set");
    });
  });

  describe("getSkills", () => {
    it("returns skills sorted by priority (lower = earlier)", () => {
      registry.registerSkill({
        id: "test:high-priority",
        name: "High Priority",
        description: "High priority skill",
        instructions: "First",
        priority: 10,
      });

      registry.registerSkill({
        id: "test:low-priority",
        name: "Low Priority",
        description: "Low priority skill",
        instructions: "Last",
        priority: 90,
      });

      registry.registerSkill({
        id: "test:medium-priority",
        name: "Medium Priority",
        description: "Medium priority skill",
        instructions: "Middle",
        priority: 50,
      });

      const skills = registry.getSkills();
      expect(skills.map((s) => s.id)).toEqual([
        "test:high-priority",
        "test:medium-priority",
        "test:low-priority",
      ]);
    });

    it("returns empty array when no skills registered", () => {
      expect(registry.getSkills()).toEqual([]);
    });
  });

  describe("getSkill", () => {
    it("returns undefined for non-existent skill", () => {
      expect(registry.getSkill("test:nonexistent")).toBeUndefined();
    });

    it("returns the skill by ID", () => {
      registry.registerSkill({
        id: "test:my-skill",
        name: "My Skill",
        description: "A test skill",
        instructions: "Do the thing",
      });

      const skill = registry.getSkill("test:my-skill");
      expect(skill?.id).toBe("test:my-skill");
    });
  });

  describe("getSkillByName", () => {
    it("returns skill by exact ID", () => {
      registry.registerSkill({
        id: "test:my-skill",
        name: "My Skill",
        description: "A test skill",
        instructions: "Do the thing",
      });

      const skill = registry.getSkillByName("test:my-skill");
      expect(skill?.id).toBe("test:my-skill");
    });

    it("returns skill by base name without source prefix", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".claude", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(
        join(skillsDir, "launch-playwright.md"),
        "Playwright instructions",
      );

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkillByName("launch-playwright");
      expect(skill).toBeDefined();
      expect(skill?.id).toBe("claude:launch-playwright");
      expect(skill?.instructions).toBe("Playwright instructions");
    });

    it("returns global skill before local when searching by base name", () => {
      const paths = createTestPaths(tempDir);
      const globalSkillsDir = join(paths.globalDir, "skills");
      const projectDir = join(tempDir, "project");
      const localSkillsDir = join(projectDir, ".workhorse", "skills");

      mkdirSync(globalSkillsDir, { recursive: true });
      mkdirSync(localSkillsDir, { recursive: true });

      writeFileSync(join(globalSkillsDir, "shared-skill.md"), "Global version");
      writeFileSync(join(localSkillsDir, "shared-skill.md"), "Local version");

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkillByName("shared-skill");
      expect(skill?.id).toBe("global:shared-skill");
      expect(skill?.instructions).toBe("Global version");
    });

    it("returns local skill if no global exists", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const localSkillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(localSkillsDir, { recursive: true });

      writeFileSync(
        join(localSkillsDir, "local-only.md"),
        "Local instructions",
      );

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkillByName("local-only");
      expect(skill?.id).toBe("local:local-only");
    });

    it("returns undefined for non-existent base name", () => {
      expect(registry.getSkillByName("nonexistent")).toBeUndefined();
    });

    it("finds skill with fuzzy matching (normalized, case-insensitive, substring)", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".claude", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(
        join(skillsDir, "launch-playwright.md"),
        "Playwright instructions",
      );
      registry.discoverLocalSkills(paths);

      expect(registry.getSkillByName("launchplaywright")?.id).toBe(
        "claude:launch-playwright",
      );
      expect(registry.getSkillByName("LAUNCH-PLAYWRIGHT")?.id).toBe(
        "claude:launch-playwright",
      );
      expect(registry.getSkillByName("playwright")?.id).toBe(
        "claude:launch-playwright",
      );
    });

    it("prefers exact match over fuzzy match", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".claude", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(join(skillsDir, "playwright.md"), "Exact match");
      writeFileSync(join(skillsDir, "launch-playwright.md"), "Fuzzy match");
      registry.discoverLocalSkills(paths);

      expect(registry.getSkillByName("playwright")?.id).toBe(
        "claude:playwright",
      );
    });
  });
});
