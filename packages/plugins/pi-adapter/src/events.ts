/**
 * Pi session event handling.
 *
 * @module workhorse-plugin-pi-adapter/events
 */
import type {
  AgentSessionEvent,
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type {
  AgentState,
  IssueStatus,
  MemoryService,
  OrchestratorTool,
  ToolExecutionContext,
} from "workhorse-core";

export interface EventHandlerContext {
  issueId: string;
  worktreePath: string;
  hooks: ToolExecutionContext["hooks"];
  memory: MemoryService;
  setState: (state: AgentState) => void;
  /** Get the current issue status from the database */
  getIssueStatus: () => Promise<IssueStatus>;
  /** Issue source (e.g., "jira", "github") */
  source: string;
}

/** Handle events from the pi session. */
export function handleSessionEvent(
  event: AgentSessionEvent,
  ctx: EventHandlerContext,
): void {
  switch (event.type) {
    case "agent_start": {
      ctx.setState("running");
      break;
    }

    case "message_update": {
      const delta = event.assistantMessageEvent;
      if (delta.type === "text_delta" && delta.delta) {
        ctx.hooks.emit("agent.output", {
          issueId: ctx.issueId,
          delta: delta.delta,
        });
      }
      break;
    }

    case "tool_execution_start": {
      ctx.hooks.emit("agent.tool_call", {
        issueId: ctx.issueId,
        tool: event.toolName,
        args: event.args,
      });
      break;
    }

    case "agent_end": {
      // Emit idle event so steering rules can evaluate
      ctx
        .getIssueStatus()
        .then((status) => {
          ctx.hooks.emit("agent.idle", {
            issueId: ctx.issueId,
            status,
            source: ctx.source,
          });
        })
        .catch((err) => {
          console.error("Failed to get issue status:", err);
        });
      break;
    }
  }
}

export interface ToolFactoryContext {
  issueId: string;
  worktreePath: string;
  db: ToolExecutionContext["db"];
  hooks: ToolExecutionContext["hooks"];
  memory: MemoryService;
}

/** Create pi extension factory from Workhorse tools. */
export function createExtensionFromTools(
  tools: OrchestratorTool[],
  ctx: ToolFactoryContext,
): ExtensionFactory {
  const execCtx: ToolExecutionContext = {
    issueId: ctx.issueId,
    worktreePath: ctx.worktreePath,
    db: ctx.db,
    hooks: ctx.hooks,
    memory: ctx.memory,
  };

  return (pi: ExtensionAPI) => {
    for (const tool of tools) {
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.schema ?? Type.Object({}),
        execute: async (_toolCallId, args) => {
          const result = await tool.execute(args, execCtx);
          if (!result.success) {
            return {
              content: [
                { type: "text", text: result.error ?? "Tool execution failed" },
              ],
              details: {},
              isError: true,
            };
          }

          // Build content array with text and optional images
          const content: (
            | { type: "text"; text: string }
            | { type: "image"; data: string; mimeType: string }
          )[] = [];

          if (result.output) {
            content.push({ type: "text", text: result.output });
          }

          if (result.images && result.images.length > 0) {
            for (const img of result.images) {
              content.push({
                type: "image",
                data: img.data,
                mimeType: img.mimeType,
              });
            }
          }

          // Ensure we have at least one content item
          if (content.length === 0) {
            content.push({ type: "text", text: "" });
          }

          return { content, details: {} };
        },
      });
    }
  };
}
