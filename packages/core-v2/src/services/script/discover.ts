import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { diagnostics } from "#diagnostics";
import { defineScript, parseFrontMatter, type ScriptT } from "#schema";
import { skillDirs } from "../skill";

function loadDir(scripts: ScriptT[], dir: string, prefix?: string): void {
  if (!existsSync(dir)) {
    return;
  }

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sh")) {
      continue;
    }

    const name = prefix
      ? `${prefix}:${basename(file, ".sh")}`
      : basename(file, ".sh");
    const path = join(dir, file);

    try {
      scripts.push(
        defineScript({
          description: `Script: ${name}`,
          name,
          ...parseFrontMatter(readFileSync(path, "utf8")),
        }),
      );
    } catch (error) {
      diagnostics.WH_SCRIPT_INVALID(
        {
          detail: error instanceof Error ? error.message : String(error),
          path,
        },
        { method: "error" },
      );
    }
  }
}

export function discoverScripts(
  cwd: string,
  home: string = homedir(),
): ScriptT[] {
  const scripts: ScriptT[] = [];
  loadDir(scripts, join(cwd, SCRIPTS_DIR));
  loadDir(scripts, join(home, SCRIPTS_DIR));

  for (const skillDir of skillDirs(cwd, home)) {
    loadDir(scripts, join(skillDir, "scripts"), basename(skillDir));
  }

  return scripts;
}

export const SCRIPTS_DIR = join(".workhorse", "scripts");
