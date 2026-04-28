/**
 * Agent spawn logic for the orchestrator.
 * @module workflow/orchestrator/spawn
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { JiratownConfig } from "#config";
import type { Database } from "#db/database";
import { createWorktree } from "#lib/git";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import type { PromptEngineer } from "#workflow/tracker";
import type { AdapterClass, AgentAdapter, OrchestratorTool, SpawnOptions } from "./types";

interface SpawnContext {
  db: Database;
  hooks: HookEmitter;
  memory: MemoryService;
  config: Readonly<JiratownConfig>;
  agents: Map<string, AgentAdapter>;
  getTools: () => OrchestratorTool[];
  getAdapterClass: (harness: string) => AdapterClass | undefined;
}

/** Spawn a new agent for an issue. */
export async function spawnAgent(
  options: SpawnOptions,
  ctx: SpawnContext,
  engineer: PromptEngineer,
): Promise<AgentAdapter> {
  const harness = options.harness ?? ctx.config.agent.harness;
  const { issue, repoPath, baseBranch = "main" } = options;
  const issueId = issue.externalId;

  // Check if agent already exists
  const existing = ctx.agents.get(issueId);
  if (existing) {
    if (existing.state === "running" || existing.state === "starting") {
      throw new Error(`Agent for issue ${issueId} is already running`);
    }
    ctx.agents.delete(issueId);
  }

  ctx.hooks.emit("orchestrator.spawn.pre", { issue, options });

  // Create or reuse worktree
  const worktree = await createWorktree(repoPath, issueId, issue.issueType, baseBranch);
  if (!worktree) {
    throw new Error(`Failed to create worktree for ${issueId}`);
  }

  ctx.db.issues.update(issue.id, { worktreePath: worktree.path });

  // Build hybrid prompt (detects resume via .jiratown/session/)
  const tools = ctx.getTools();
  const { systemPrompt, initialMessage } = await engineer.buildHybridPrompt(issue, {
    isResume: existsSync(join(worktree.path, ".jiratown", "session")),
    tools,
  });

  // Look up adapter class by harness
  const AdapterClass = ctx.getAdapterClass(harness);
  if (!AdapterClass) {
    throw new Error(`No adapter registered for harness: ${harness}`);
  }

  const adapter = new AdapterClass({
    issue,
    worktreePath: worktree.path,
    systemPrompt,
    initialMessage,
    tools,
    db: ctx.db,
    hooks: ctx.hooks,
    memory: ctx.memory,
    model: options.model,
  });

  ctx.agents.set(issueId, adapter);

  try {
    await adapter.start();
    ctx.hooks.emit("orchestrator.spawn.post", { adapter });
    return adapter;
  } catch (error) {
    ctx.agents.delete(issueId);
    throw error;
  }
}
