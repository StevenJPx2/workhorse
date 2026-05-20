/**
 * Skill registry - manages plugin and local skill discovery/registration.
 * @module workflow/orchestrator/skills
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { ConfigPaths } from "#config";
import { createFuzzySearcher, type FuzzySearcher, type HookEmitter } from "#lib";

import type { PluginSkillInput, ResolvedSkill } from "./types";
import { PluginSkillSchema } from "./types";

interface SkillSearchItem {
  id: string;
  name: string;
  skill: ResolvedSkill;
}

/** Registry for managing skills from plugins and local directories. */
export class SkillRegistry {
  private readonly skills = new Map<string, ResolvedSkill>();
  private currentPluginPath: string | null = null;
  private searcherDirty = true;
  private cachedSearcher: FuzzySearcher<SkillSearchItem> | null = null;

  constructor(private readonly hooks: HookEmitter) {}

  /** Get or rebuild the fuzzy searcher (lazy, cached until skills change). */
  private getSearcher(): FuzzySearcher<SkillSearchItem> {
    if (!this.searcherDirty && this.cachedSearcher) return this.cachedSearcher;
    this.cachedSearcher = createFuzzySearcher(
      Array.from(this.skills.values()).map((s) => ({ id: s.id, name: s.name, skill: s })),
      { keys: ["id", "name"], threshold: 0.4 },
    );
    this.searcherDirty = false;
    return this.cachedSearcher;
  }

  private invalidateSearcher(): void {
    this.searcherDirty = true;
  }
  setCurrentPluginPath(path: string | null): void {
    this.currentPluginPath = path;
  }

  /** Register a skill. Plugins call this during setup. */
  registerSkill(input: PluginSkillInput): void {
    const validated = PluginSkillSchema.parse(input);

    if (this.skills.has(validated.id)) {
      throw new Error(`Skill "${validated.id}" already registered`);
    }

    const resolved: ResolvedSkill = {
      id: validated.id,
      name: validated.name,
      description: validated.description,
      instructions: validated.instructions ?? this.loadSkillFile(validated.instructionsPath!),
      priority: validated.priority,
    };

    this.skills.set(resolved.id, resolved);
    this.invalidateSearcher();
    this.hooks.emit("skill.registered", { skill: resolved });
  }

  /** Get all registered skills, sorted by priority (lower = earlier). */
  getSkills(): ResolvedSkill[] {
    return [...this.skills.values()].sort((a, b) => a.priority - b.priority);
  }

  /** Get a skill by ID. Returns undefined if not found. */
  getSkill(id: string): ResolvedSkill | undefined {
    return this.skills.get(id);
  }

  /** Get a skill by name with fuzzy matching (Fuse.js): exact ID → exact base name → fuzzy. */
  getSkillByName(name: string): ResolvedSkill | undefined {
    return this.skills.get(name) ?? this.getSearcher().findBest(name)?.skill;
  }

  /**
   * Discover and register skills from local directories.
   * Searches: ~/.workhorse/skills/, .workhorse/skills/, .claude/skills/
   * Earlier registrations take precedence.
   */
  discoverLocalSkills(paths: ConfigPaths): void {
    const projectRoot = dirname(paths.projectConfig);
    this.discoverFromDir(join(paths.globalDir, "skills"), "global");
    this.discoverFromDir(join(projectRoot, ".workhorse", "skills"), "local");
    this.discoverFromDir(join(projectRoot, ".claude", "skills"), "claude");
  }

  /**
   * Discover skills from a directory. Supports two patterns:
   * - Direct .md files: skills/my-skill.md -> ID "source:my-skill"
   * - Folder with SKILL.md: skills/my-skill/SKILL.md -> ID "source:my-skill"
   */
  private discoverFromDir(directory: string, source: string): void {
    if (!existsSync(directory)) return;

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        this.registerSkillFromFile(
          join(directory, entry.name),
          basename(entry.name, ".md"),
          source,
        );
      } else if (entry.isDirectory()) {
        const skillMdPath = join(directory, entry.name, "SKILL.md");
        if (existsSync(skillMdPath)) {
          this.registerSkillFromFile(skillMdPath, entry.name, source);
        }
      }
    }
  }

  /** Register a skill from a file path. */
  private registerSkillFromFile(filePath: string, skillName: string, source: string): void {
    const skillId = `${source}:${skillName}`;
    if (this.skills.has(skillId)) return;

    try {
      const { metadata, body } = this.parseSkillFile(readFileSync(filePath, "utf-8"));

      const resolved: ResolvedSkill = {
        id: skillId,
        name: metadata.name ?? this.titleCase(skillName),
        description: metadata.description ?? `Local skill: ${skillName}`,
        instructions: body,
        priority: metadata.priority ?? 50,
      };

      this.skills.set(resolved.id, resolved);
      this.invalidateSearcher();
      this.hooks.emit("skill.registered", { skill: resolved });
    } catch (error) {
      console.warn(
        `Skipping invalid skill file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Parse a skill file with optional YAML frontmatter. */
  private parseSkillFile(content: string): {
    metadata: { name?: string; description?: string; priority?: number };
    body: string;
  } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) return { metadata: {}, body: content.trim() };

    const [, yaml, body] = frontmatterMatch;
    const metadata: { name?: string; description?: string; priority?: number } = {};

    for (const line of (yaml ?? "").split("\n")) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (key === "name") metadata.name = value?.trim();
      if (key === "description") metadata.description = value?.trim();
      if (key === "priority") metadata.priority = parseInt(value ?? "50", 10);
    }

    return { metadata, body: (body ?? "").trim() };
  }

  /** Load a skill file from the current plugin's directory. */
  private loadSkillFile(relativePath: string): string {
    if (!this.currentPluginPath) {
      throw new Error("Cannot load skill file: no plugin path set");
    }
    const fullPath = resolve(this.currentPluginPath, relativePath);
    try {
      return readFileSync(fullPath, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to load skill file "${fullPath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Convert kebab-case to Title Case */
  private titleCase(str: string): string {
    return str
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}
