/**
 * Pi session event handling.
 *
 * @module @jiratown/plugin-pi-adapter/events
 */

import type {
  AgentSessionEvent,
  ExtensionAPI,
  ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type {
  AgentState,
  IssueStatus,
  MemoryService,
  OrchestratorTool,
  ToolExecutionContext,
} from "@jiratown/core";

export interface EventHandlerContext {
  issueId: string;
  worktreePath: string;
  hooks: ToolExecutionContext["hooks"];
  memory: MemoryService;
  setState: (state: AgentState) => void;
  /** Get the current issue status from the database */
  getIssueStatus: () => IssueStatus;
  /** Issue source (e.g., "jira", "github") */
  source: string;
}

/** Handle events from the pi session. */
export function handleSessionEvent(event: AgentSessionEvent, ctx: EventHandlerContext): void {
  switch (event.type) {
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
      ctx.hooks.emit("agent.idle", {
        issueId: ctx.issueId,
        status: ctx.getIssueStatus(),
        source: ctx.source,
      });

      updateL1Memory(ctx).catch((err) => {
        console.error("Failed to update L1 memory:", err);
      });
      break;
    }
  }
}

/** Update L1 memory with session summary. */
async function updateL1Memory(ctx: EventHandlerContext): Promise<void> {
  const l1 = ctx.memory.l1.get(ctx.issueId);
  if (!l1) return;

  const sessionData = await l1.read();
  if (!sessionData) return;

  sessionData.sessions.push({
    timestamp: new Date(),
    status: ctx.getIssueStatus(),
    summary: ["Session completed"],
    learnings: [],
    filesChanged: [],
  });
  await l1.write(sessionData);
}

export interface ToolFactoryContext {
  issueId: string;
  worktreePath: string;
  db: ToolExecutionContext["db"];
  hooks: ToolExecutionContext["hooks"];
  memory: MemoryService;
}

/** Create pi extension factory from Jiratown tools. */
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
              content: [{ type: "text", text: result.error ?? "Tool execution failed" }],
              details: {},
              isError: true,
            };
          }
          return {
            content: [{ type: "text", text: result.output ?? "" }],
            details: {},
          };
        },
      });
    }
  };
}
