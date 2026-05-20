import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  type WorkhorseConfig,
  mergeConfigs,
  parseTomlFile,
  writeTomlFile,
  DEFAULT_CONFIG,
} from "workhorse-core";

import type { SetupPluginConfig } from "../screens/setup";

/**
 * Plugin configuration requirements for setup validation.
 */
export interface PluginConfigRequirement {
  name: string;
  fields: Array<{
    key: string;
    label: string;
    description: string;
    required: boolean;
    default?: string;
  }>;
}

/**
 * Default plugin requirements for Workhorse.
 * These define which plugins need configuration and what fields they require.
 */
export const PLUGIN_REQUIREMENTS: PluginConfigRequirement[] = [
  {
    name: "jira",
    fields: [
      {
        key: "cloudId",
        label: "Jira Cloud ID",
        description:
          "Your Atlassian Cloud ID (found in your Jira URL: https://<cloudId>.atlassian.net)",
        required: true,
      },
      {
        key: "pollInterval",
        label: "Poll Interval (ms)",
        description: "How often to check for new comments (default: 30000)",
        required: false,
        default: "30000",
      },
    ],
  },
  {
    name: "github",
    fields: [
      {
        key: "pollInterval",
        label: "Poll Interval (ms)",
        description: "How often to check for PR updates (default: 30000)",
        required: false,
        default: "30000",
      },
    ],
  },
  {
    name: "figma",
    fields: [
      {
        key: "commentPollInterval",
        label: "Comment Poll Interval (ms)",
        description: "How often to check for new Figma comments (default: 60000)",
        required: false,
        default: "60000",
      },
      {
        key: "filePollInterval",
        label: "File Poll Interval (ms)",
        description: "How often to check for Figma file updates (default: 120000)",
        required: false,
        default: "120000",
      },
    ],
  },
];

/**
 * Load existing config from TOML files and merge with defaults.
 */
export function loadExistingConfig(
  globalConfigPath: string,
  projectConfigPath: string,
): WorkhorseConfig {
  return mergeConfigs(
    DEFAULT_CONFIG,
    parseTomlFile(globalConfigPath),
    parseTomlFile(projectConfigPath),
  );
}

/**
 * Save plugin config to a TOML file.
 */
export function savePluginConfig(configPath: string, newConfig: Partial<WorkhorseConfig>): void {
  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Load existing config, merge, and write only the plugin section
  writeTomlFile(configPath, {
    plugins: mergeConfigs(DEFAULT_CONFIG, parseTomlFile(configPath), newConfig).plugins,
  });
}

/**
 * Check if setup is needed by validating existing config against requirements.
 *
 * @returns Array of plugins that need configuration, or empty array if all good.
 */
export function getPluginsNeedingSetup(
  existingConfig: WorkhorseConfig,
  requirements: PluginConfigRequirement[] = PLUGIN_REQUIREMENTS,
): SetupPluginConfig[] {
  const needsSetup: SetupPluginConfig[] = [];

  for (const requirement of requirements) {
    const pluginConfig = (existingConfig.plugins[requirement.name] ?? {}) as Record<
      string,
      unknown
    >;
    const missingRequired = requirement.fields.filter(
      (field) => field.required && !pluginConfig[field.key],
    );

    // If any required field is missing, add to setup list
    if (missingRequired.length > 0) {
      needsSetup.push({
        name: requirement.name,
        fields: requirement.fields.map((field) => ({
          ...field,
          value: pluginConfig[field.key] != null ? String(pluginConfig[field.key]) : undefined,
        })),
      });
    }
  }

  return needsSetup;
}

/**
 * Convert setup values to proper config format for saving.
 */
export function setupValuesToConfig(
  values: Record<string, Record<string, string>>,
): Partial<WorkhorseConfig> {
  const plugins: Record<string, unknown> = {};

  for (const [pluginName, fields] of Object.entries(values)) {
    const pluginConfig: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (value) {
        // Try to parse as number if it looks like one
        if (/^\d+$/.test(value)) {
          pluginConfig[key] = parseInt(value, 10);
        } else {
          pluginConfig[key] = value;
        }
      }
    }

    // Add plugin config (even if empty, for plugins with all-optional fields)
    plugins[pluginName] = pluginConfig;
  }

  return { plugins: { disabled: [], ...plugins } };
}
