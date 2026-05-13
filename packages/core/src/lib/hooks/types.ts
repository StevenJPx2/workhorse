import type { Emitter } from "mitt";
import type { Issue, IssueStatus, Notification } from "#db";
import type { AgentAdapter, CreateOptions } from "#workflow/orchestrator";
import type { PromptBuildingContext } from "#workflow/tracker";

type KnownEvents = {
  // Issues
  "issue.parsed": { issue: Issue; raw: unknown };
  "issue.status_changed": { issue: Issue; from: IssueStatus; to: IssueStatus };
  "issue.deleted": { issue: Issue };

  // Prompts
  "prompt.building": { issueId: string; context: PromptBuildingContext };
  "prompt.built": { issueId: string; prompt: string };

  // Agent lifecycle
  "agent.create.pre": { issue: Issue; options: CreateOptions };
  "agent.create.post": { adapter: AgentAdapter };
  "agent.start.pre": { adapter: AgentAdapter };
  "agent.start.post": { adapter: AgentAdapter };
  "agent.stop.pre": { adapter: AgentAdapter };
  "agent.stop.post": { adapter: AgentAdapter };

  // Agent events (bridged from harness session.subscribe())
  "agent.output": { issueId: string; delta: string };
  "agent.tool_call": { issueId: string; tool: string; args: unknown };
  "agent.crashed": { issueId: string; error: Error };
  "agent.idle": { issueId: string; status: IssueStatus; source: string };

  // Steering (idle steering system)
  "steering.reminder": { issueId: string; reminder: string };

  // User interactions
  "user.message": { issueId: string; content: string };

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

  // TUI events (registered by workhorse plugin)
  "tui.register_renderer": { id: string; renderer: unknown; priority?: number };
};

export type HookEventName = keyof KnownEvents | (string & {});

export type HookEventMap = KnownEvents & Record<string, unknown>;

export type HookEmitter = Emitter<HookEventMap>;
