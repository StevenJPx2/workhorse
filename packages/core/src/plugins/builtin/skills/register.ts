/**
 * Registers built-in skills for Workhorse development guidance.
 *
 * @module plugins/builtin/skills/register
 */

import { generateHooksReference } from "#lib";
import type { SkillRegistry } from "#workflow";

// Import skill content as raw strings (bundled at build time)
import pluginDevelopmentMd from "./plugin-development.md?raw";
import skillDevelopmentMd from "./skill-development.md?raw";

/**
 * Register built-in development skills.
 */
export function registerBuiltinSkills(registry: SkillRegistry): void {
  // Plugin development guide with dynamically generated hooks reference
  registry.registerSkill({
    id: "builtin:plugin-development",
    name: "Plugin Development",
    description:
      "How to create Workhorse plugins with tools, parsers, monitors, and hooks",
    instructions: `${pluginDevelopmentMd}\n\n${generateHooksReference()}`,
    priority: 60,
  });

  // Skill development guide
  registry.registerSkill({
    id: "builtin:skill-development",
    name: "Skill Development",
    description:
      "How to create Workhorse skills for on-demand agent instructions",
    instructions: skillDevelopmentMd,
    priority: 60,
  });
}
