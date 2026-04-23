import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ConfigPaths } from "./types.ts";

/**
 * Resolve all config and data paths for Jiratown.
 *
 * Config file search order (first found wins):
 * 1. ~/.jiratown.toml
 * 2. ~/.config/jiratown.toml
 * 3. ~/.config/jiratown/config.toml
 *
 * Data directory: ~/.local/share/jiratown/
 * Respects XDG_CONFIG_HOME and XDG_DATA_HOME environment variables.
 *
 * Worktrees root: ../repo-worktrees/ (sibling to repo)
 */
export function resolveConfigPaths(repoRoot: string = process.cwd()): ConfigPaths {
  const home = homedir();
  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");
  const xdgData = process.env["XDG_DATA_HOME"] ?? join(home, ".local", "share");

  const globalConfig =
    [
      join(home, ".jiratown.toml"),
      join(xdgConfig, "jiratown.toml"),
      join(xdgConfig, "jiratown", "config.toml"),
    ].find((path) => existsSync(path)) ?? join(home, ".jiratown.toml");

  const globalDir = join(xdgData, "jiratown");

  // Worktrees root is a sibling directory: ../repo-worktrees/
  const repoName = basename(repoRoot);
  const worktreesRoot = join(dirname(repoRoot), `${repoName}-worktrees`);

  return {
    globalDir,
    globalConfig,
    projectConfig: join(repoRoot, ".jiratown.toml"),
    database: join(globalDir, "jiratown.db"),
    memoryDatabase: join(globalDir, "memory.db"),
    worktreesRoot,
  };
}
