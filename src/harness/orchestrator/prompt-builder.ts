/**
 * Agent prompt generation - builds initial or resume prompts based on session state
 */

import {
  generateInitialPrompt,
  generateResumePrompt,
} from "./system-prompt/index.ts";
import {
  hasSessionMemory,
  readSessionMemory,
  writeSessionMemory,
  createSessionMemory,
  addSessionEvent,
} from "../session/session-memory.ts";
import { orchestratorTrace } from "./trace.ts";

interface PromptContext {
  ticketId: string;
  agentType: "opencode" | "claude";
  worktreePath: string;
  worktreeBranch: string;
  jiraSummary: string | null | undefined;
  jiraDescription: string | null | undefined;
  jiraUrl: string | undefined;
  jiraCloudId: string | undefined;
}

export function prepareAgentPrompt(ctx: PromptContext): string {
  const {
    ticketId,
    agentType,
    worktreePath,
    worktreeBranch,
    jiraSummary,
    jiraDescription,
    jiraUrl,
    jiraCloudId,
  } = ctx;

  const existingMemory = hasSessionMemory(worktreePath)
    ? readSessionMemory(worktreePath)
    : null;

  if (existingMemory) {
    orchestratorTrace(ticketId, "RESUMING_SESSION", {
      lastStatus: existingMemory.status,
      activityCount: existingMemory.recentActivity.length,
    });

    const prompt = generateResumePrompt({
      ticketId,
      jiraKey: ticketId,
      summary: jiraSummary ?? null,
      description: jiraDescription ?? null,
      worktreePath,
      branchName: worktreeBranch,
      jiraUrl,
      jiraCloudId,
      sessionSummary: existingMemory.summary,
      recentActivity: existingMemory.recentActivity,
      keyDecisions: existingMemory.keyDecisions,
    });

    addSessionEvent(worktreePath, {
      timestamp: new Date().toISOString(),
      type: "status_change",
      description: "Agent session resumed",
    });

    return prompt;
  }

  orchestratorTrace(ticketId, "FRESH_START");

  const memory = createSessionMemory(
    ticketId,
    "pending",
    agentType,
    worktreeBranch,
    jiraSummary ?? undefined
  );
  writeSessionMemory(worktreePath, memory);

  return generateInitialPrompt({
    ticketId,
    jiraKey: ticketId,
    summary: jiraSummary ?? null,
    description: jiraDescription ?? null,
    worktreePath,
    branchName: worktreeBranch,
    jiraUrl,
    jiraCloudId,
  });
}