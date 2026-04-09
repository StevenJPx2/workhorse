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
  // Get the path to jiratown's mcp-server.sh wrapper script
  // The wrapper ensures bun runs from jiratown's directory so it finds dependencies
  const jiratownRoot = process.env.JIRATOWN_ROOT || process.cwd();
  const mcpServerScript = `${jiratownRoot}/src/mcp-server.sh`;

  const config: OpenCodeConfig = {
    $schema: "https://opencode.ai/config.json",
    mcp: {
      jiratown: {
        type: "local",
        command: [mcpServerScript, "--ticket", ticketId],
        environment: {
          JIRATOWN_TICKET_ID: ticketId,
          JIRATOWN_ROOT: jiratownRoot,
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
 * Escape a string for safe use in a shell command
 * Uses single quotes and escapes any embedded single quotes
 */
function escapeForShell(str: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  // Then wrap in single quotes
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Build the agent command
 * 
 * For OpenCode: Run `opencode --port <port> --prompt <prompt>` so we can communicate via SDK
 * For Claude: Run `claude` - it uses its own config discovery
 * 
 * @param agentType - Type of agent to run
 * @param ticketId - Ticket ID used for port allocation
 * @param prompt - Optional initial prompt to pass to the agent
 */
export function buildAgentCommand(
  agentType: "opencode" | "claude",
  ticketId: string,
  prompt?: string
): { command: string; args: string[] } {
  if (agentType === "opencode") {
    // Import dynamically to avoid circular dependency
    const { buildOpenCodeCommandWithPort } = require("./opencode-client/index.ts");
    const result = buildOpenCodeCommandWithPort(ticketId);
    
    // Add prompt if provided, properly escaped for shell
    if (prompt) {
      result.args.push("--prompt", escapeForShell(prompt));
    }
    
    return result;
  }

  // Claude Code uses its own config discovery
  return {
    command: "claude",
    args: [],
  };
}
