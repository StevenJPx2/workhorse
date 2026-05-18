/**
 * Skill registry - manages plugin and local skill discovery/registration.
 *
 * Skills are markdown instructions that agents can load on-demand.
 * Sources:
 * - Plugin skills: registered via registerSkill() during plugin setup
 * - Local skills: discovered from:
 *   - ~/.workhorse/skills/ (global)
 *   - .workhorse/skills/ (project)
 *   - .claude/skills/ (standard agent directory)
 *
 * @module workflow/orchestrator/skills
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { ConfigPaths } from "#config";
import type { HookEmitter } from "#lib/hooks";
import type { PluginSkillInput, ResolvedSkill } from "./types";
import { PluginSkillSchema } from "./types";

/**
 * Registry for managing skills from plugins and local directories.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, ResolvedSkill>();
  private currentPluginPath: string | null = null;

  constructor(private readonly hooks: HookEmitter) {}

  /**
   * Set the current plugin path for resolving skill file paths.
   * Called by the plugin registry before plugin setup.
   */
  setCurrentPluginPath(path: string | null): void {
    this.currentPluginPath = path;
  }

  /**
   * Register a skill. Plugins call this during setup.
   * @throws If skill ID is invalid, already registered, or file not found
   */
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

  /**
   * Discover and register skills from local directories.
   *
   * Searches (in order, later sources don't override earlier):
   * - ~/.workhorse/skills/ (global workhorse skills)
   * - .workhorse/skills/ (project workhorse skills)
   * - .claude/skills/ (standard agent skills directory)
   *
   * Skill files are markdown with optional YAML frontmatter:
   * ```markdown
   * ---
   * name: My Skill
   * description: What this skill teaches
   * priority: 30
   * ---
   * ## Instructions
   * ...
   * ```
   */
  discoverLocalSkills(paths: ConfigPaths): void {
    const projectRoot = dirname(paths.projectConfig);

    // Discover from global and project directories
    // Order matters: earlier registrations take precedence
    this.discoverFromDir(join(paths.globalDir, "skills"), "global");
    this.discoverFromDir(join(projectRoot, ".workhorse", "skills"), "local");

    // Also check standard .claude/skills directory for compatibility with other agents
    this.discoverFromDir(join(projectRoot, ".claude", "skills"), "claude");
  }

  /**
   * Discover skills from a directory.
   * Each .md file becomes a skill with ID "source:filename" (without extension).
   */
  private discoverFromDir(directory: string, source: string): void {
    if (!existsSync(directory)) return;

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const filePath = join(directory, entry.name);
      const skillName = basename(entry.name, ".md");
      const skillId = `${source}:${skillName}`;

      // Skip if already registered (plugin skills take precedence)
      if (this.skills.has(skillId)) continue;

      try {
        const content = readFileSync(filePath, "utf-8");
        const { metadata, body } = this.parseSkillFile(content);

        const resolved: ResolvedSkill = {
          id: skillId,
          name: metadata.name ?? this.titleCase(skillName),
          description: metadata.description ?? `Local skill: ${skillName}`,
          instructions: body,
          priority: metadata.priority ?? 50,
        };

        this.skills.set(resolved.id, resolved);
        this.hooks.emit("skill.registered", { skill: resolved });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Skipping invalid skill file "${filePath}": ${msg}`);
      }
    }
  }

  /** Parse a skill file with optional YAML frontmatter. */
  private parseSkillFile(content: string): {
    metadata: { name?: string; description?: string; priority?: number };
    body: string;
  } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      return { metadata: {}, body: content.trim() };
    }

    const [, yaml, body] = frontmatterMatch;
    const metadata: { name?: string; description?: string; priority?: number } = {};

    // Simple YAML parsing (just key: value pairs)
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
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load skill file "${fullPath}": ${msg}`);
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
