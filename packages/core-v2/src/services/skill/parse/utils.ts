import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontMatter, type ScriptUsageT } from "#schema";

export function parseResources(dir: string): string[] {
  return globSync("**", { cwd: dir })
    .filter((path) => {
      if (basename(path) === "SKILL.md") {
        return false;
      }

      return statSync(join(dir, path)).isFile();
    })
    .toSorted();
}

export function parseScripts(dir: string): ScriptUsageT[] {
  const scriptsDir = join(dir, "scripts");

  if (!existsSync(scriptsDir)) {
    return [];
  }

  const scripts: ScriptUsageT[] = [];

  for (const file of globSync("*.sh", { cwd: scriptsDir })) {
    const name = basename(file, ".sh");

    scripts.push({
      description: `Script: ${name}`,
      name,
      ...parseFrontMatter(readFileSync(join(scriptsDir, file), "utf8")),
    });
  }

  return scripts.toSorted((a, b) => a.name.localeCompare(b.name));
}

export function parseMetadata(
  value: unknown,
): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const entries: Record<string, string> = {};

  for (const [key, raw] of Object.entries(value)) {
    entries[key] = String(raw);
  }

  return entries;
}
