import type { Issue, IssueStatus, Notification } from "#db";
import type { PromptContextBlock, PromptBuildingContext } from "../../workflow/tracker/types.ts";

// Re-export for convenience
export type { PromptContextBlock, PromptBuildingContext } from "../../workflow/tracker/types.ts";

export interface AgentInstance {
  id: string;
  issueId: string;
  pid?: number;
  worktree?: string;
}

type KnownEvents = {
  // Issues
  "issue.parsed": { issue: Issue; raw: unknown };
  "issue.status_changed": { issue: Issue; from: IssueStatus; to: IssueStatus };

  // Prompts
  "prompt.building": { issueId: string; context: PromptBuildingContext };
  "prompt.built": { issueId: string; prompt: string };

  // Agents
  "agent.starting": { instance: AgentInstance };
  "agent.started": { instance: AgentInstance };

  "agent.stopping": { instance: AgentInstance };
  "agent.stopped": { instance: AgentInstance };

  "agent.crashed": { instance: AgentInstance; error?: Error };

  // Notifications
  "notification.created": { notification: Notification; issueId: string };

  // Monitors
  "monitor.registered": { name: string; type: "remote" | "local" };
  "monitor.tick": { id: string; issueId: string; result: unknown };
  "monitor.error": { id: string; issueId: string; error: Error; errorCount: number };

  // Plugins
  "plugin.loaded": { name: string };
  "plugin.error": { name: string; error: Error };
};

export type HookEventMap = KnownEvents & Record<string, unknown>;
