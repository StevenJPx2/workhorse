/**
 * Agent spawning - creates worktree, MCP config, tmux session, and starts agent
 */

import type { SpawnAgentOptions, SpawnResult } from "./types.ts";
import { createWorktree, removeWorktree } from "../session/worktree/index.ts";
import {
  createSession,
  killSession,
  sendKeys,
  sessionExists,
} from "../session/tmux/index.ts";
import {
  generateMcpConfig,
  writeMcpConfig,
  buildAgentCommand,
} from "./mcp-config.ts";
import { activeAgents, createAgentInstance, updateAgentState } from "./agent-store.ts";
import { orchestratorTrace } from "./trace.ts";
import { prepareAgentPrompt } from "./prompt-builder.ts";

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
    jiraUrl,
  } = options;

  orchestratorTrace(ticketId, "SPAWN_ENTER", { agentType, repoPath: !!repoPath });

  const existing = activeAgents.get(ticketId);
  if (existing && existing.state === "running") {
    orchestratorTrace(ticketId, "SPAWN_BLOCKED", { existingState: existing.state });
    return {
      success: false,
      error: `Agent already running for ticket ${ticketId}`,
    };
  }

  const instance = createAgentInstance(ticketId, agentType);
  activeAgents.set(ticketId, instance);
  updateAgentState(ticketId, "starting");

  try {
    orchestratorTrace(ticketId, "CREATING_WORKTREE", { repoPath: !!repoPath, issueType });
    const worktree = await createWorktree(
      repoPath,
      ticketId,
      issueType,
      baseBranch
    );

    if (!worktree) {
      orchestratorTrace(ticketId, "WORKTREE_FAILED");
      updateAgentState(ticketId, "crashed");
      return {
        success: false,
        error: "Failed to create git worktree",
      };
    }

    instance.worktree = worktree;
    orchestratorTrace(ticketId, "WORKTREE_CREATED", { path: worktree.path, branch: worktree.branch });

    const mcpConfig = generateMcpConfig(ticketId, jiraCloudId);
    const configPath = writeMcpConfig(worktree.path, ticketId, mcpConfig);
    instance.mcpConfigPath = configPath;

    const existingSession = await sessionExists(ticketId);
    if (existingSession) {
      orchestratorTrace(ticketId, "KILLING_EXISTING_SESSION");
      console.log(`Killing existing tmux session for ${ticketId}`);
      await killSession(ticketId);
    }

    orchestratorTrace(ticketId, "CREATING_SESSION");
    const session = await createSession(ticketId, worktree.path);

    if (!session) {
      orchestratorTrace(ticketId, "SESSION_FAILED");
      await removeWorktree(repoPath, ticketId);
      updateAgentState(ticketId, "crashed");
      return {
        success: false,
        error: "Failed to create tmux session",
      };
    }

    instance.session = session;
    orchestratorTrace(ticketId, "SESSION_CREATED", { sessionName: session.name });

    const prompt = prepareAgentPrompt({
      ticketId,
      agentType,
      worktreePath: worktree.path,
      worktreeBranch: worktree.branch,
      jiraSummary,
      jiraDescription,
      jiraUrl,
      jiraCloudId,
    });

    const { command, args } = buildAgentCommand(agentType, ticketId, prompt);
    const agentCmd =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    orchestratorTrace(ticketId, "STARTING_AGENT", {
      command,
      argsCount: args.length,
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 200),
    });
    const started = await sendKeys(ticketId, agentCmd, true);

    if (!started) {
      orchestratorTrace(ticketId, "AGENT_START_FAILED");
      await killSession(ticketId);
      await removeWorktree(repoPath, ticketId);
      updateAgentState(ticketId, "crashed");
      return {
        success: false,
        error: "Failed to start agent in tmux session",
      };
    }

    updateAgentState(ticketId, "running");
    orchestratorTrace(ticketId, "SPAWN_SUCCESS");

    return {
      success: true,
      instance,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    orchestratorTrace(ticketId, "SPAWN_EXCEPTION", { error: errorMsg });
    updateAgentState(ticketId, "crashed");
    return {
      success: false,
      error: errorMsg,
    };
  }
}