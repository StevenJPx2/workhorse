import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ConfigPaths } from "./types.ts";

/**
 * Resolve all config and data paths for Jiratown.
 *
 * Config file search order (first found wins):
 * 1. ~/.workhorse.toml
 * 2. ~/.config/workhorse.toml
 * 3. ~/.config/workhorse/config.toml
 *
 * Data directory: ~/.local/share/workhorse/
 * Respects XDG_CONFIG_HOME and XDG_DATA_HOME environment variables.
 *
 * Worktrees root: ../repo-worktrees/ (sibling to repo)
 */
export function resolveConfigPaths(repoRoot: string = process.cwd()): ConfigPaths {
  const home = homedir();
  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");
  const globalDir = join(process.env["XDG_DATA_HOME"] ?? join(home, ".local", "share"), "workhorse");

  return {
    globalDir,
    globalConfig:
      [
        join(home, ".workhorse.toml"),
        join(xdgConfig, "workhorse.toml"),
        join(xdgConfig, "workhorse", "config.toml"),
      ].find((path) => existsSync(path)) ?? join(home, ".workhorse.toml"),
    projectConfig: join(repoRoot, ".workhorse.toml"),
    database: join(globalDir, "workhorse.db"),
    memoryDatabase: join(globalDir, "memory.db"),
    worktreesRoot: join(dirname(repoRoot), `${basename(repoRoot)}-worktrees`),
  };
}
