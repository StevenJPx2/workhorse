/**
 * Agent prompt generation - builds initial or resume prompts based on session state
 */

import { generateInitialPrompt, generateResumePrompt } from "./system-prompt/index.ts";
import {
  hasSessionMemory,
  readSessionMemory,
  writeSessionMemory,
  createSessionMemory,
  addSessionEvent,
  type SessionMemory,
  type SessionEvent,
} from "../../session/session-memory.ts";
import { orchestratorTrace } from "./trace.ts";

export interface PromptContext {
  ticketId: string;
  agentType: "opencode" | "claude";
  worktreePath: string;
  worktreeBranch: string;
  jiraSummary: string | null | undefined;
  jiraDescription: string | null | undefined;
  jiraUrl: string | undefined;
  jiraCloudId: string | undefined;
}

export interface PromptBuilderDeps {
  hasSessionMemory: (worktreePath: string) => boolean;
  readSessionMemory: (worktreePath: string) => SessionMemory | null;
  writeSessionMemory: (worktreePath: string, memory: SessionMemory) => boolean;
  createSessionMemory: (
    ticketId: string,
    status: string,
    agent: string,
    branch: string,
    summary?: string,
  ) => SessionMemory;
  addSessionEvent: (worktreePath: string, event: SessionEvent) => boolean;
  orchestratorTrace: (tid: string, step: string, data?: unknown) => void;
}

const defaultDeps: PromptBuilderDeps = {
  hasSessionMemory,
  readSessionMemory,
  writeSessionMemory,
  createSessionMemory,
  addSessionEvent,
  orchestratorTrace,
};

export function prepareAgentPrompt(
  ctx: PromptContext,
  deps: PromptBuilderDeps = defaultDeps,
): string {
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

  const existingMemory = deps.hasSessionMemory(worktreePath)
    ? deps.readSessionMemory(worktreePath)
    : null;

  if (existingMemory) {
    deps.orchestratorTrace(ticketId, "RESUMING_SESSION", {
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

    deps.addSessionEvent(worktreePath, {
      timestamp: new Date().toISOString(),
      type: "status_change",
      description: "Agent session resumed",
    });

    return prompt;
  }

  deps.orchestratorTrace(ticketId, "FRESH_START");

  const memory = deps.createSessionMemory(
    ticketId,
    "pending",
    agentType,
    worktreeBranch,
    jiraSummary ?? undefined,
  );
  deps.writeSessionMemory(worktreePath, memory);

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
