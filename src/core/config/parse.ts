import { existsSync, readFileSync } from "node:fs";
import * as TOML from "toml";
import type { JiratownConfig, ResolvedConfig } from "#types/config.ts";

export function parseTomlFile(filePath: string): JiratownConfig | null {
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

export function mergeConfigs(
  base: ResolvedConfig,
  overrides: JiratownConfig | null,
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
    ui: {
      theme: overrides.ui?.theme ?? base.ui.theme,
    },
    behavior: {
      auto_resume: overrides.behavior?.auto_resume ?? base.behavior.auto_resume,
    },
  };
}

export function configToToml(config: JiratownConfig): string {
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

  if (config.ui) {
    lines.push("[ui]");
    if (config.ui.theme) {
      lines.push(`theme = "${config.ui.theme}"`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
