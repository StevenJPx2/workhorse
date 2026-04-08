/**
 * Agent Orchestrator
 *
 * Coordinates the lifecycle of AI agents working on tickets:
 * - Creates git worktrees for code isolation
 * - Spawns tmux sessions for process isolation
 * - Generates MCP configs for agent communication
 * - Monitors agent health
 */

import type {
  AgentInstance,
  AgentState,
  SpawnAgentOptions,
  SpawnResult,
  StopResult,
  HealthCheckResult,
} from "./types.ts";
import {
  createWorktree,
  removeWorktree,
  getWorktree,
  type Worktree,
} from "../session/worktree.ts";
import {
  createSession,
  killSession,
  sendKeys,
  capturePane,
  sessionExists,
  type TmuxSession,
} from "../session/tmux.ts";
import {
  generateMcpConfig,
  writeMcpConfig,
  removeMcpConfig,
  buildAgentCommand,
} from "./mcp-config.ts";
import { generateInitialPrompt } from "./system-prompt.ts";

/**
 * In-memory store of active agent instances
 */
const activeAgents = new Map<string, AgentInstance>();

/**
 * Create an initial agent instance
 */
function createAgentInstance(
  ticketId: string,
  agentType: "opencode" | "claude"
): AgentInstance {
  return {
    ticketId,
    agentType,
    state: "idle",
    session: null,
    worktree: null,
    startedAt: null,
    stoppedAt: null,
    lastHealthCheck: null,
    mcpConfigPath: null,
  };
}

/**
 * Update agent state
 */
function updateAgentState(ticketId: string, state: AgentState): void {
  const agent = activeAgents.get(ticketId);
  if (agent) {
    agent.state = state;
    if (state === "running") {
      agent.startedAt = new Date().toISOString();
    } else if (state === "stopped" || state === "crashed") {
      agent.stoppedAt = new Date().toISOString();
    }
  }
}

/**
 * Spawn an agent to work on a ticket
 *
 * This function:
 * 1. Creates a git worktree for code isolation
 * 2. Generates MCP config for agent communication
 * 3. Creates a tmux session
 * 4. Starts the agent in the session
 * 5. Sends the initial prompt to the agent
 */
export async function spawnAgent(
  options: SpawnAgentOptions
): Promise<SpawnResult> {
  const {
    ticketId,
    agentType,
    repoPath,
    issueType,
    baseBranch,
    jiraCloudId,
    jiraSummary,
    jiraDescription,
  } = options;

  // Check if agent already exists for this ticket
  const existing = activeAgents.get(ticketId);
  if (existing && existing.state === "running") {
    return {
      success: false,
      error: `Agent already running for ticket ${ticketId}`,
    };
  }

  // Create agent instance
  const instance = createAgentInstance(ticketId, agentType);
  activeAgents.set(ticketId, instance);
  updateAgentState(ticketId, "starting");

  try {
    // Step 1: Create worktree
    const worktree = await createWorktree(
      repoPath,
      ticketId,
      issueType,
      baseBranch
    );

    if (!worktree) {
      updateAgentState(ticketId, "crashed");
      return {
        success: false,
        error: "Failed to create git worktree",
      };
    }

    instance.worktree = worktree;

    // Step 2: Generate and write MCP config
    const mcpConfig = generateMcpConfig(ticketId, jiraCloudId);
    const configPath = writeMcpConfig(worktree.path, ticketId, mcpConfig);
    instance.mcpConfigPath = configPath;

    // Step 3: Create tmux session
    const session = await createSession(ticketId, worktree.path);

    if (!session) {
      // Cleanup worktree on failure
      await removeWorktree(repoPath, ticketId);
      updateAgentState(ticketId, "crashed");
      return {
        success: false,
        error: "Failed to create tmux session",
      };
    }

    instance.session = session;

    // Step 4: Start the agent
    const { command, args } = buildAgentCommand(agentType, configPath);
    const agentCmd =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    const started = await sendKeys(ticketId, agentCmd, true);

    if (!started) {
      await killSession(ticketId);
      await removeWorktree(repoPath, ticketId);
      updateAgentState(ticketId, "crashed");
      return {
        success: false,
        error: "Failed to start agent in tmux session",
      };
    }

    // Give agent time to start up
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 5: Send initial prompt
    const prompt = generateInitialPrompt({
      ticketId,
      jiraKey: ticketId,
      summary: jiraSummary ?? null,
      description: jiraDescription ?? null,
      worktreePath: worktree.path,
      branchName: worktree.branch,
    });

    await sendKeys(ticketId, prompt, true);

    updateAgentState(ticketId, "running");

    return {
      success: true,
      instance,
    };
  } catch (error) {
    updateAgentState(ticketId, "crashed");
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stop an agent working on a ticket
 *
 * This function:
 * 1. Kills the tmux session
 * 2. Optionally removes the worktree
 * 3. Cleans up MCP config
 */
export async function stopAgent(
  ticketId: string,
  repoPath: string,
  removeWorktreeOnStop: boolean = false
): Promise<StopResult> {
  const instance = activeAgents.get(ticketId);

  if (!instance) {
    return {
      success: false,
      error: `No agent found for ticket ${ticketId}`,
    };
  }

  updateAgentState(ticketId, "stopping");

  try {
    // Kill tmux session
    if (instance.session) {
      await killSession(ticketId);
    }

    // Clean up MCP config
    if (instance.worktree) {
      removeMcpConfig(instance.worktree.path, ticketId);
    }

    // Optionally remove worktree
    if (removeWorktreeOnStop && instance.worktree) {
      await removeWorktree(repoPath, ticketId);
    }

    updateAgentState(ticketId, "stopped");
    activeAgents.delete(ticketId);

    return { success: true };
  } catch (error) {
    updateAgentState(ticketId, "crashed");
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check health of an agent
 */
export async function checkAgentHealth(
  ticketId: string
): Promise<HealthCheckResult> {
  const instance = activeAgents.get(ticketId);
  const now = new Date().toISOString();

  if (!instance) {
    return {
      ticketId,
      healthy: false,
      sessionExists: false,
      checkedAt: now,
    };
  }

  const exists = await sessionExists(ticketId);
  const output = exists ? (await capturePane(ticketId)) ?? undefined : undefined;

  instance.lastHealthCheck = now;

  // If session doesn't exist but we think agent is running, it crashed
  if (!exists && instance.state === "running") {
    updateAgentState(ticketId, "crashed");
  }

  return {
    ticketId,
    healthy: exists && instance.state === "running",
    sessionExists: exists,
    lastOutput: output,
    checkedAt: now,
  };
}

/**
 * Get agent instance for a ticket
 */
export function getAgent(ticketId: string): AgentInstance | undefined {
  return activeAgents.get(ticketId);
}

/**
 * Get all active agents
 */
export function getAllAgents(): AgentInstance[] {
  return Array.from(activeAgents.values());
}

/**
 * Get agents in a specific state
 */
export function getAgentsByState(state: AgentState): AgentInstance[] {
  return getAllAgents().filter((a) => a.state === state);
}

/**
 * Send a message to an agent
 */
export async function sendMessageToAgent(
  ticketId: string,
  message: string
): Promise<boolean> {
  const instance = activeAgents.get(ticketId);

  if (!instance || instance.state !== "running") {
    return false;
  }

  return await sendKeys(ticketId, message, true);
}

/**
 * Capture current agent output
 */
export async function captureAgentOutput(
  ticketId: string
): Promise<string | null> {
  const instance = activeAgents.get(ticketId);

  if (!instance || instance.state !== "running") {
    return null;
  }

  return await capturePane(ticketId);
}
