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

describe("SkillRegistry discoverLocalSkills", () => {
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

  it("discovers skills from global directory", () => {
    const paths = createTestPaths(tempDir);
    const skillsDir = join(paths.globalDir, "skills");
    mkdirSync(skillsDir, { recursive: true });

    writeFileSync(
      join(skillsDir, "my-skill.md"),
      "## My Global Skill\n\nDo something globally",
    );

    registry.discoverLocalSkills(paths);

    const skill = registry.getSkill("global:my-skill");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("My Skill");
    expect(skill?.instructions).toBe(
      "## My Global Skill\n\nDo something globally",
    );
  });

  it("discovers skills from project directory", () => {
    const paths = createTestPaths(tempDir);
    const projectDir = join(tempDir, "project");
    const skillsDir = join(projectDir, ".workhorse", "skills");
    mkdirSync(skillsDir, { recursive: true });

    writeFileSync(
      join(skillsDir, "local-skill.md"),
      "## Local Skill\n\nDo something locally",
    );

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
    expect(skill?.instructions).toBe(
      "## Instructions\n\n1. Do this\n2. Do that",
    );
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
    registry.registerSkill({
      id: "local:my-skill",
      name: "Plugin Skill",
      description: "From plugin",
      instructions: "Plugin instructions",
    });

    const paths = createTestPaths(tempDir);
    const projectDir = join(tempDir, "project");
    const skillsDir = join(projectDir, ".workhorse", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "my-skill.md"), "Local instructions");

    registry.discoverLocalSkills(paths);

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
    expect(skill?.instructions).toBe(
      "## Agent Skill\n\nInstructions for the agent",
    );
  });

  it("workhorse skills take precedence over .claude skills with same name", () => {
    const paths = createTestPaths(tempDir);
    const projectDir = join(tempDir, "project");

    const workhorseSkillsDir = join(projectDir, ".workhorse", "skills");
    mkdirSync(workhorseSkillsDir, { recursive: true });
    writeFileSync(
      join(workhorseSkillsDir, "shared-skill.md"),
      "Workhorse version",
    );

    const claudeSkillsDir = join(projectDir, ".claude", "skills");
    mkdirSync(claudeSkillsDir, { recursive: true });
    writeFileSync(join(claudeSkillsDir, "shared-skill.md"), "Claude version");

    registry.discoverLocalSkills(paths);

    const localSkill = registry.getSkill("local:shared-skill");
    const claudeSkill = registry.getSkill("claude:shared-skill");

    expect(localSkill).toBeDefined();
    expect(localSkill?.instructions).toBe("Workhorse version");
    expect(claudeSkill).toBeDefined();
    expect(claudeSkill?.instructions).toBe("Claude version");
  });
});
