import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
  defineScript,
  ScriptArgs,
  type ScriptArgsT,
  type ScriptT,
} from "#schema";

import { skillDirs } from "../skill";

const ARGS_PREFIX = "#workhorse:args ";

function loadDir(scripts: ScriptT[], dir: string, prefix?: string): void {
  if (!existsSync(dir)) {
    return;
  }

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sh")) {
      continue;
    }

    let name = basename(file, ".sh");

    if (prefix) {
      name = `${prefix}:${name}`;
    }

    const command = readFileSync(join(dir, file), "utf8");

    scripts.push(
      defineScript({
        args: ScriptArgs.parse(
          JSON.parse(
            command
              .split("\n")
              .find((raw) => raw.startsWith(ARGS_PREFIX))
              ?.slice(ARGS_PREFIX.length) ?? "{}",
          ),
        ),
        command,
        description:
          command
            .split("\n")
            .map((raw) => raw.trim())
            .find(
              (l) =>
                !(
                  l === "" ||
                  l.startsWith("#!") ||
                  l.startsWith("#workhorse:")
                ),
            )
            ?.match(/^#\s*(.+)$/u)?.[1]
            ?.trim() ?? `Script: ${name}`,
        name,
      }),
    );
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

export function encodeArgs(args: ScriptArgsT): string {
  return `${ARGS_PREFIX}${JSON.stringify(args)}`;
}

export const SCRIPTS_DIR = join(".workhorse", "scripts");
