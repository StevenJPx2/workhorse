/**
 * Configuration types for Jiratown
 */

export type AgentType = "opencode" | "claude";
export type ThemeName = "tokyonight" | "gruvbox" | "default";

export interface JiraConfig {
  cloud_id: string;
}

export interface DefaultsConfig {
  agent: AgentType;
}

export interface UiConfig {
  theme: ThemeName;
}

export interface BehaviorConfig {
  /** Auto-resume agents on startup for tickets in active states */
  auto_resume: boolean;
}

export interface PromptConfig {
  /**
   * Custom project-specific instructions appended to the agent's system prompt.
   * Use this to provide context about the project, coding standards, testing
   * requirements, or any other project-specific guidance for the AI agent.
   *
   * Example:
   * ```toml
   * [prompt]
   * custom = """
   * This is a TypeScript monorepo using Bun.
   * - Always run `bun test` before opening a PR
   * - Follow the existing code style in the codebase
   * - Add JSDoc comments to all public functions
   * """
   * ```
   */
  custom?: string;
}

export interface JiratownConfig {
  jira?: JiraConfig;
  defaults?: DefaultsConfig;
  ui?: UiConfig;
  behavior?: BehaviorConfig;
  prompt?: PromptConfig;
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
  ui: {
    theme: ThemeName;
  };
  behavior: {
    auto_resume: boolean;
  };
  prompt: {
    custom: string | null;
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
