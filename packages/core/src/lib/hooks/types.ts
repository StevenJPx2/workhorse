import type { AgentInstance, Issue, IssueStatus, Notification } from "#types";

export interface PromptContext {
  issueId: string;
  metadata: Record<string, unknown>;
}

type KnownEvents = {
  // Issues
  "issue.parsed": { issue: Issue; raw: unknown };
  "issue.status_changed": { issue: Issue; from: IssueStatus; to: IssueStatus };

  // Prompts
  "prompt.building": { issueId: string; context: PromptContext };
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
  "monitor.tick": { name: string; result: unknown };

  // Plugins
  "plugin.loaded": { name: string };
  "plugin.error": { name: string; error: Error };
};

export type HookEventMap = KnownEvents & Record<string, unknown>;
