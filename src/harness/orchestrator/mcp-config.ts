/**
 * MCP config generation for agents
 *
 * Generates temporary MCP configuration files that agents use to connect
 * to the Jiratown MCP server and other services.
 */

import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

/**
 * OpenCode looks for MCP config in .opencode/opencode.json in the project directory
 */
const OPENCODE_CONFIG_DIR = ".opencode";
const OPENCODE_CONFIG_FILE = "opencode.json";

/**
 * Get the path where agent MCP configs are stored
 * For OpenCode, this is .opencode/ in the worktree
 */
export function getConfigDir(worktreePath: string): string {
  return join(worktreePath, OPENCODE_CONFIG_DIR);
}

/**
 * Get the path for a specific agent's MCP config
 * For OpenCode, this is .opencode/opencode.json
 */
export function getConfigPath(worktreePath: string, _ticketId: string): string {
  return join(getConfigDir(worktreePath), OPENCODE_CONFIG_FILE);
}

/**
 * OpenCode config structure with MCP servers
 * This follows the OpenCode config schema at https://opencode.ai/config.json
 */
export interface OpenCodeConfig {
  $schema?: string;
  mcp?: {
    [name: string]: {
      type: "local" | "remote";
      command?: string[];
      url?: string;
      environment?: Record<string, string>;
      enabled?: boolean;
    };
  };
}

/**
 * Generate OpenCode config with MCP servers for an agent
 *
 * @param ticketId - Ticket ID the agent is working on
 * @param jiraCloudId - Optional Jira cloud ID for Atlassian MCP
 */
export function generateMcpConfig(
  ticketId: string,
  jiraCloudId?: string
): OpenCodeConfig {
  const config: OpenCodeConfig = {
    $schema: "https://opencode.ai/config.json",
    mcp: {
      jiratown: {
        type: "local",
        command: ["bun", "run", "jiratown-mcp", "--ticket", ticketId],
        environment: {
          JIRATOWN_TICKET_ID: ticketId,
        },
        enabled: true,
      },
    },
  };

  // Add Atlassian MCP if cloud ID provided
  if (jiraCloudId && config.mcp) {
    config.mcp.atlassian = {
      type: "remote",
      url: "https://mcp.atlassian.com/v1/mcp",
      enabled: true,
    };
  }

  return config;
}

/**
 * Write MCP config to disk for an agent
 *
 * @returns Path to the written config file
 */
export function writeMcpConfig(
  worktreePath: string,
  ticketId: string,
  config: OpenCodeConfig
): string {
  const configDir = getConfigDir(worktreePath);
  const configPath = getConfigPath(worktreePath, ticketId);

  // Ensure config directory exists
  mkdirSync(configDir, { recursive: true });

  // Write config file
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  return configPath;
}

/**
 * Remove MCP config for an agent
 */
export function removeMcpConfig(worktreePath: string, ticketId: string): void {
  const configPath = getConfigPath(worktreePath, ticketId);
  try {
    rmSync(configPath, { force: true });
  } catch {
    // Ignore errors if file doesn't exist
  }
}

/**
 * Build the agent command
 * 
 * For OpenCode: Just run `opencode` - it will find .opencode/opencode.json automatically
 * For Claude: Run `claude` - it uses its own config discovery
 * 
 * @param agentType - Type of agent to run
 * @param _configPath - Unused, kept for API compatibility
 */
export function buildAgentCommand(
  agentType: "opencode" | "claude",
  _configPath: string
): { command: string; args: string[] } {
  if (agentType === "opencode") {
    // OpenCode automatically finds .opencode/opencode.json in the project directory
    // No special flags needed - just run opencode
    return {
      command: "opencode",
      args: [],
    };
  }

  // Claude Code uses its own config discovery
  return {
    command: "claude",
    args: [],
  };
}
