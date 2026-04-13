import { getGitRoot } from "../git/detect-rig.ts";
import { DEFAULT_CONFIG } from "./defaults.ts";
import { getConfigPaths } from "./paths.ts";
import { mergeConfigs, parseTomlFile } from "./parse.ts";
import type { ResolvedConfig } from "#types/config.ts";

export async function loadConfig(cwd?: string): Promise<ResolvedConfig> {
  const gitRoot = await getGitRoot(cwd);
  const paths = getConfigPaths(gitRoot ?? undefined);

  let config: ResolvedConfig = { ...DEFAULT_CONFIG };

  const globalConfig = parseTomlFile(paths.globalConfig);
  if (globalConfig) {
    config = mergeConfigs(config, globalConfig);
  }

  if (paths.projectConfig) {
    const projectConfig = parseTomlFile(paths.projectConfig);
    if (projectConfig) {
      config = mergeConfigs(config, projectConfig);
    }
  }

  return config;
}
