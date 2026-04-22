import { DEFAULT_CONFIG } from "./defaults.ts";
import { mergeConfigs, parseTomlFile } from "./parse.ts";
import type { ConfigPaths, JiratownConfig } from "./types.ts";

/**
 * Load and merge configuration from global and project config files.
 *
 * Merge order (last wins): defaults → global → project
 */
export function loadConfig(paths: ConfigPaths): JiratownConfig {
  return mergeConfigs(
    DEFAULT_CONFIG,
    parseTomlFile(paths.globalConfig),
    parseTomlFile(paths.projectConfig),
  );
}
