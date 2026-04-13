import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JiratownConfig, ThemeName } from "../../types/config.ts";
import { getGitRoot } from "../detect-rig.ts";
import { ensureConfigDir, getConfigPaths } from "./paths.ts";
import { configToToml } from "./parse.ts";
import { loadConfig } from "./load.ts";

export function saveGlobalConfig(config: JiratownConfig): void {
  ensureConfigDir();
  const paths = getConfigPaths();
  const toml = configToToml(config);

  const dir = dirname(paths.globalConfig);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(paths.globalConfig, toml, "utf-8");
}

export async function saveProjectConfig(config: JiratownConfig, cwd?: string): Promise<void> {
  const gitRoot = await getGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not in a git repository");
  }

  const configPath = join(gitRoot, ".jiratown.toml");
  const toml = configToToml(config);
  writeFileSync(configPath, toml, "utf-8");
}

export async function saveTheme(themeName: ThemeName): Promise<void> {
  const config = await loadConfig();
  saveGlobalConfig({
    jira: config.jira,
    defaults: config.defaults,
    ui: { theme: themeName },
  });
}
