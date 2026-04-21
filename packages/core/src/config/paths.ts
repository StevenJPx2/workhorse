import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigPaths } from "./types.ts";

/**
 * Resolve global config directory using standard XDG-style precedence:
 * 1. ~/.jiratown (legacy/simple)
 * 2. ~/.config/jiratown
 * 3. $XDG_CONFIG_HOME/jiratown
 *
 * Returns the first existing directory, or ~/.jiratown as default.
 */
function resolveGlobalDir(): string {
  const home = homedir();
  const xdgConfig = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");

  const candidates = [
    join(home, ".jiratown"),
    join(home, ".config", "jiratown"),
    join(xdgConfig, "jiratown"),
  ];

  // Return first existing, or default to ~/.jiratown
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]!;
}

export function getConfigPaths(repoRoot?: string): ConfigPaths {
  const globalDir = resolveGlobalDir();
  return {
    globalDir,
    globalConfig: join(globalDir, "config.toml"),
    database: join(globalDir, "jiratown.db"),
    projectConfig: repoRoot ? join(repoRoot, ".jiratown.toml") : null,
  };
}
