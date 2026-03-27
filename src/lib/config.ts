/**
 * Configuration file management for Jiratown
 *
 * Handles:
 * - Global config: ~/.jiratown/config.toml
 * - Project config: .jiratown.toml (in git root)
 * - Config merging (project overrides global)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TOML from "toml";
import type {
  ConfigPaths,
  JiratownConfig,
  ResolvedConfig,
} from "../types/config.ts";
import { getGitRoot } from "./detect-rig.ts";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ResolvedConfig = {
  jira: {
    cloud_id: "",
  },
  defaults: {
    agent: "opencode",
  },
};

/**
 * Get paths to config files and directories
 */
export function getConfigPaths(projectRoot?: string): ConfigPaths {
  const globalDir = join(homedir(), ".jiratown");
  return {
    globalDir,
    globalConfig: join(globalDir, "config.toml"),
    database: join(globalDir, "jiratown.db"),
    projectConfig: projectRoot ? join(projectRoot, ".jiratown.toml") : null,
  };
}

/**
 * Ensure the global config directory exists
 */
export function ensureConfigDir(): string {
  const paths = getConfigPaths();
  if (!existsSync(paths.globalDir)) {
    mkdirSync(paths.globalDir, { recursive: true });
  }
  return paths.globalDir;
}

/**
 * Check if global config exists
 */
export function configExists(): boolean {
  const paths = getConfigPaths();
  return existsSync(paths.globalConfig);
}

/**
 * Parse a TOML config file
 */
function parseTomlFile(filePath: string): JiratownConfig | null {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    return TOML.parse(content) as JiratownConfig;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Merge two configs, with overrides taking precedence
 */
function mergeConfigs(
  base: ResolvedConfig,
  overrides: JiratownConfig | null
): ResolvedConfig {
  if (!overrides) {
    return base;
  }
  return {
    jira: {
      cloud_id: overrides.jira?.cloud_id ?? base.jira.cloud_id,
    },
    defaults: {
      agent: overrides.defaults?.agent ?? base.defaults.agent,
    },
  };
}

/**
 * Load and resolve configuration
 *
 * Resolution order:
 * 1. Start with defaults
 * 2. Apply global config (~/.jiratown/config.toml)
 * 3. Apply project config (.jiratown.toml in git root)
 */
export async function loadConfig(cwd?: string): Promise<ResolvedConfig> {
  // Get git root for project config
  const gitRoot = await getGitRoot(cwd);
  const paths = getConfigPaths(gitRoot ?? undefined);

  // Start with defaults
  let config: ResolvedConfig = { ...DEFAULT_CONFIG };

  // Apply global config
  const globalConfig = parseTomlFile(paths.globalConfig);
  if (globalConfig) {
    config = mergeConfigs(config, globalConfig);
  }

  // Apply project config (if exists)
  if (paths.projectConfig) {
    const projectConfig = parseTomlFile(paths.projectConfig);
    if (projectConfig) {
      config = mergeConfigs(config, projectConfig);
    }
  }

  return config;
}

/**
 * Generate TOML content from config
 */
function configToToml(config: JiratownConfig): string {
  const lines: string[] = [];

  if (config.jira) {
    lines.push("[jira]");
    if (config.jira.cloud_id) {
      lines.push(`cloud_id = "${config.jira.cloud_id}"`);
    }
    lines.push("");
  }

  if (config.defaults) {
    lines.push("[defaults]");
    if (config.defaults.agent) {
      lines.push(`agent = "${config.defaults.agent}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Save global configuration
 */
export function saveGlobalConfig(config: JiratownConfig): void {
  ensureConfigDir();
  const paths = getConfigPaths();
  const toml = configToToml(config);

  // Ensure parent directory exists
  const dir = dirname(paths.globalConfig);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(paths.globalConfig, toml, "utf-8");
}

/**
 * Save project-level configuration
 */
export async function saveProjectConfig(
  config: JiratownConfig,
  cwd?: string
): Promise<void> {
  const gitRoot = await getGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not in a git repository");
  }

  const configPath = join(gitRoot, ".jiratown.toml");
  const toml = configToToml(config);
  writeFileSync(configPath, toml, "utf-8");
}
