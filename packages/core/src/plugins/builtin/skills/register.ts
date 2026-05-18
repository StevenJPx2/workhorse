/**
 * Registers built-in skills for Workhorse development guidance.
 *
 * @module plugins/builtin/skills/register
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateHooksReference } from "#lib/hooks";
import type { SkillRegistry } from "#workflow/orchestrator";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Register built-in development skills.
 */
export function registerBuiltinSkills(registry: SkillRegistry): void {
  // Plugin development guide with dynamically generated hooks reference
  registry.registerSkill({
    id: "builtin:plugin-development",
    name: "Plugin Development",
    description: "How to create Workhorse plugins with tools, parsers, monitors, and hooks",
    instructions: `${loadSkillFile("plugin-development.md")}\n\n${generateHooksReference()}`,
    priority: 60,
  });

  // Skill development guide
  registry.registerSkill({
    id: "builtin:skill-development",
    name: "Skill Development",
    description: "How to create Workhorse skills for on-demand agent instructions",
    instructions: loadSkillFile("skill-development.md"),
    priority: 60,
  });
}

/**
 * Load a skill file from the skills directory.
 */
function loadSkillFile(filename: string): string {
  return readFileSync(join(__dirname, filename), "utf-8");
}
