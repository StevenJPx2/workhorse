/**
 * Configuration types for Jiratown
 */

export type AgentType = "opencode" | "claude";

export interface JiraConfig {
  cloud_id: string;
}

export interface DefaultsConfig {
  agent: AgentType;
}

export interface JiratownConfig {
  jira?: JiraConfig;
  defaults?: DefaultsConfig;
}

/**
 * Resolved configuration with all required fields
 * (after merging global + project configs)
 */
export interface ResolvedConfig {
  jira: {
    cloud_id: string;
  };
  defaults: {
    agent: AgentType;
  };
}

/**
 * Paths to config files
 */
export interface ConfigPaths {
  globalDir: string; // ~/.jiratown
  globalConfig: string; // ~/.jiratown/config.toml
  database: string; // ~/.jiratown/jiratown.db
  projectConfig: string | null; // .jiratown.toml in git root (if exists)
}
