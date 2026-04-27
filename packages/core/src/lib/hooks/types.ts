import type { Emitter } from "mitt";
import type { Issue, IssueStatus, Notification } from "#db";
import type { AgentAdapter, SpawnOptions } from "#workflow/orchestrator";
import type { PromptBuildingContext } from "#workflow/tracker";

// Re-export for convenience
export type { PromptBuildingContext, PromptContextBlock } from "#workflow/tracker";

type KnownEvents = {
  // Issues
  "issue.parsed": { issue: Issue; raw: unknown };
  "issue.status_changed": { issue: Issue; from: IssueStatus; to: IssueStatus };

  // Prompts
  "prompt.building": { issueId: string; context: PromptBuildingContext };
  "prompt.built": { issueId: string; prompt: string };

  // Orchestrator lifecycle
  "orchestrator.spawn.pre": { issue: Issue; options: SpawnOptions };
  "orchestrator.spawn.post": { adapter: AgentAdapter };
  "orchestrator.stop.pre": { adapter: AgentAdapter };
  "orchestrator.stop.post": { adapter: AgentAdapter };

  // Agent events (bridged from harness session.subscribe())
  "agent.output": { issueId: string; delta: string };
  "agent.tool_call": { issueId: string; tool: string; args: unknown };
  "agent.crashed": { issueId: string; error: Error };
  "agent.idle": { issueId: string; status: IssueStatus; source: string };

  // Steering (idle steering system)
  "steering.reminder": { issueId: string; reminder: string };

  // Notifications
  "notification.created": { notification: Notification; issueId: string };

  // Monitors
  "monitor.registered": { name: string; type: "remote" | "local" };
  "monitor.tick": { id: string; issueId: string; result: unknown };
  "monitor.error": {
    id: string;
    issueId: string;
    error: Error;
    errorCount: number;
  };

  // Plugins
  "plugin.loaded": { name: string };
  "plugin.error": { name: string; error: Error };
};

export type HookEventMap = KnownEvents & Record<string, unknown>;

export type HookEmitter = Emitter<HookEventMap>;
