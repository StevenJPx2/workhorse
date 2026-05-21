/** Skill file parsing and loading utilities. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ResolvedSkill } from "../types";

export interface SkillFileMetadata {
  name?: string;
  description?: string;
  priority?: number;
}

/** Parse a skill file with optional YAML frontmatter. */
export function parseSkillFile(content: string): {
  metadata: SkillFileMetadata;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return { metadata: {}, body: content.trim() };

  const [, yaml, body] = frontmatterMatch;
  const metadata: SkillFileMetadata = {};

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

/** Build a ResolvedSkill from file contents. */
export function buildSkillFromFile(
  skillId: string,
  skillName: string,
  source: string,
  metadata: SkillFileMetadata,
  body: string,
): ResolvedSkill {
  return {
    id: skillId,
    name: metadata.name ?? titleCase(skillName),
    description: metadata.description ?? `Local skill: ${skillName}`,
    instructions: body,
    priority: metadata.priority ?? 50,
  };
}

/** Load a skill file from a plugin directory. */
export function loadSkillFile(
  pluginPath: string | null,
  relativePath: string,
): string {
  if (!pluginPath) {
    throw new Error("Cannot load skill file: no plugin path set");
  }
  const fullPath = resolve(pluginPath, relativePath);
  try {
    return readFileSync(fullPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to load skill file "${fullPath}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Convert kebab-case to Title Case */
export function titleCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
