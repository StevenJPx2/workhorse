import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigPaths } from "#types/config.ts";

export function getConfigPaths(projectRoot?: string): ConfigPaths {
  const globalDir = join(homedir(), ".jiratown");
  return {
    globalDir,
    globalConfig: join(globalDir, "config.toml"),
    database: join(globalDir, "jiratown.db"),
    projectConfig: projectRoot ? join(projectRoot, ".jiratown.toml") : null,
  };
}

export function ensureConfigDir(): string {
  const paths = getConfigPaths();
  if (!existsSync(paths.globalDir)) {
    mkdirSync(paths.globalDir, { recursive: true });
  }
  return paths.globalDir;
}

export function configExists(): boolean {
  const paths = getConfigPaths();
  return existsSync(paths.globalConfig);
}
