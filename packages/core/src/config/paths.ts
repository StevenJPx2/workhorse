import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigPaths } from "./types.ts";

export function getConfigPaths(repoRoot?: string, globalDir?: string): ConfigPaths {
  const dir = globalDir ?? join(homedir(), ".jiratown");
  return {
    globalDir: dir,
    globalConfig: join(dir, "config.toml"),
    database: join(dir, "jiratown.db"),
    projectConfig: repoRoot ? join(repoRoot, ".jiratown.toml") : null,
  };
}
