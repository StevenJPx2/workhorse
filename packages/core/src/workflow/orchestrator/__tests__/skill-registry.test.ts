import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfigPaths } from "#config";
import type { HookEmitter } from "#lib/hooks";
import { createMockHooks } from "#lib/hooks/__tests__/test-helpers";

import { SkillRegistry } from "../skills.ts";

/** Create a minimal ConfigPaths for testing */
function createTestPaths(tempDir: string): ConfigPaths {
  const globalDir = join(tempDir, "global");
  const projectDir = join(tempDir, "project");
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
      // Create a skill file in the temp directory
      const skillContent = "## Instructions\n\n1. Step one\n2. Step two";
      const skillFile = join(tempDir, "my-skill.md");
      writeFileSync(skillFile, skillContent);

      // Set the plugin path to the temp directory
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

  describe("discoverLocalSkills", () => {
    it("discovers skills from global directory", () => {
      const paths = createTestPaths(tempDir);
      const skillsDir = join(paths.globalDir, "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(join(skillsDir, "my-skill.md"), "## My Global Skill\n\nDo something globally");

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkill("global:my-skill");
      expect(skill).toBeDefined();
      expect(skill?.name).toBe("My Skill");
      expect(skill?.instructions).toBe("## My Global Skill\n\nDo something globally");
    });

    it("discovers skills from project directory", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(join(skillsDir, "local-skill.md"), "## Local Skill\n\nDo something locally");

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkill("local:local-skill");
      expect(skill).toBeDefined();
      expect(skill?.instructions).toBe("## Local Skill\n\nDo something locally");
    });

    it("parses YAML frontmatter for metadata", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(
        join(skillsDir, "custom-skill.md"),
        `---
name: Custom Skill Name
description: A custom description
priority: 25
---
## Instructions

1. Do this
2. Do that`,
      );

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkill("local:custom-skill");
      expect(skill).toBeDefined();
      expect(skill?.name).toBe("Custom Skill Name");
      expect(skill?.description).toBe("A custom description");
      expect(skill?.priority).toBe(25);
      expect(skill?.instructions).toBe("## Instructions\n\n1. Do this\n2. Do that");
    });

    it("uses filename as default name (title-cased)", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(join(skillsDir, "my-cool-skill.md"), "Some instructions");

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkill("local:my-cool-skill");
      expect(skill?.name).toBe("My Cool Skill");
    });

    it("does not overwrite already registered skills", () => {
      // Register a plugin skill first
      registry.registerSkill({
        id: "local:my-skill",
        name: "Plugin Skill",
        description: "From plugin",
        instructions: "Plugin instructions",
      });

      // Create a local skill with the same ID
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(skillsDir, { recursive: true });
      writeFileSync(join(skillsDir, "my-skill.md"), "Local instructions");

      registry.discoverLocalSkills(paths);

      // Plugin skill should take precedence
      const skill = registry.getSkill("local:my-skill");
      expect(skill?.instructions).toBe("Plugin instructions");
    });

    it("ignores non-.md files", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(join(skillsDir, "readme.txt"), "Not a skill");
      writeFileSync(join(skillsDir, "config.json"), "{}");
      writeFileSync(join(skillsDir, "actual-skill.md"), "Real skill");

      registry.discoverLocalSkills(paths);

      expect(registry.getSkills().length).toBe(1);
      expect(registry.getSkill("local:actual-skill")).toBeDefined();
    });

    it("handles missing directories gracefully", () => {
      const paths = createTestPaths(join(tempDir, "nonexistent"));

      // Should not throw when directories don't exist
      expect(() => registry.discoverLocalSkills(paths)).not.toThrow();

      expect(registry.getSkills()).toEqual([]);
    });

    it("emits skill.registered for each discovered skill", () => {
      const handler = vi.fn();
      hooks.on("skill.registered", handler);

      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(join(skillsDir, "skill-one.md"), "Skill one");
      writeFileSync(join(skillsDir, "skill-two.md"), "Skill two");

      registry.discoverLocalSkills(paths);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("discovers skills from .claude/skills directory", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");
      const skillsDir = join(projectDir, ".claude", "skills");
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(
        join(skillsDir, "agent-skill.md"),
        "## Agent Skill\n\nInstructions for the agent",
      );

      registry.discoverLocalSkills(paths);

      const skill = registry.getSkill("claude:agent-skill");
      expect(skill).toBeDefined();
      expect(skill?.name).toBe("Agent Skill");
      expect(skill?.instructions).toBe("## Agent Skill\n\nInstructions for the agent");
    });

    it("workhorse skills take precedence over .claude skills with same name", () => {
      const paths = createTestPaths(tempDir);
      const projectDir = join(tempDir, "project");

      // Create workhorse skill first (higher precedence)
      const workhorseSkillsDir = join(projectDir, ".workhorse", "skills");
      mkdirSync(workhorseSkillsDir, { recursive: true });
      writeFileSync(join(workhorseSkillsDir, "shared-skill.md"), "Workhorse version");

      // Create .claude skill with same name (lower precedence)
      const claudeSkillsDir = join(projectDir, ".claude", "skills");
      mkdirSync(claudeSkillsDir, { recursive: true });
      writeFileSync(join(claudeSkillsDir, "shared-skill.md"), "Claude version");

      registry.discoverLocalSkills(paths);

      // Both should exist with different IDs
      const localSkill = registry.getSkill("local:shared-skill");
      const claudeSkill = registry.getSkill("claude:shared-skill");

      expect(localSkill).toBeDefined();
      expect(localSkill?.instructions).toBe("Workhorse version");
      expect(claudeSkill).toBeDefined();
      expect(claudeSkill?.instructions).toBe("Claude version");
    });
  });
});
