import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { defineSkill, type SkillT } from "#schema";

interface Frontmatter {
  description?: string;
  name?: string;
}

function readSkill(path: string, scope: string, key: string): SkillT {
  const content = readFileSync(path, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);

  if (!match) {
    return defineSkill({
      description: `Skill: ${key}`,
      instructions: content.trim(),
      name: key,
      scope,
    });
  }

  const meta: Frontmatter = {};

  for (const line of match[1]!.split("\n")) {
    const [, mkey, value = ""] = line.match(/^(\w+):\s*(.+)$/u) ?? [];

    if (mkey === "name" || mkey === "description") {
      meta[mkey] = value.trim();
    }
  }

  return defineSkill({
    description: meta.description ?? `Skill: ${key}`,
    instructions: match[2]!.trim(),
    name: meta.name ?? key,
    scope,
  });
}

export function skillDirs(cwd: string, home: string = homedir()): string[] {
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
      if (entry.isDirectory()) {
        return [join(root, entry.name)];
      }

      return [];
    });
  });
}

export function discoverSkills(
  cwd: string,
  home: string = homedir(),
): SkillT[] {
  const byName = new Map<string, SkillT>();

  for (const { dir, file, name } of skillDirs(cwd, home).flatMap((d) =>
    readdirSync(d)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        dir: d,
        file: f,
        name: basename(d),
      })),
  )) {
    let key = name;

    if (file !== "SKILL.md") {
      key = `${name}:${basename(file, ".md")}`;
    }

    const skill = readSkill(join(dir, file), name, key);

    byName.set(skill.name, skill);
  }

  return [...byName.values()];
}
