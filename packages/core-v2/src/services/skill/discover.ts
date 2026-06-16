import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { diagnostics } from "#diagnostics";
import type { SkillT } from "#schema";

import { parseSkill } from "./parse";

function skillDirs(cwd: string, home: string = homedir()): string[] {
  return [
    join(home, ".claude", "skills"),
    join(home, ".agents", "skills"),
    join(cwd, ".claude", "skills"),
    join(cwd, ".agents", "skills"),
  ].flatMap((root) => {
    if (!existsSync(root)) {
      return [];
    }

    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) {
        return [];
      }

      const dir = join(root, entry.name);

      return existsSync(join(dir, "SKILL.md")) ? [dir] : [];
    });
  });
}

function discoverSkills(cwd: string, home: string = homedir()): SkillT[] {
  const byName = new Map<string, SkillT>();

  for (const dir of skillDirs(cwd, home)) {
    const skill = parseSkill(join(dir, "SKILL.md"));

    if (!skill) {
      continue;
    }

    if (byName.has(skill.name)) {
      diagnostics.WH_SKILL_SHADOWED({ name: skill.name });
    }

    byName.set(skill.name, skill);
  }

  return [...byName.values()];
}

export { discoverSkills, skillDirs };
