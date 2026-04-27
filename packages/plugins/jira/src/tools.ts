/**
 * Jira tools registered with the orchestrator.
 *
 * @module @jiratown/plugin-jira/tools
 */

import type { JiratownContext, OrchestratorTool } from "@jiratown/core";
import type { AtlassianClient } from "./client.ts";

type Hooks = JiratownContext["hooks"];

/** Create Jira tool definitions bound to a client */
export function createJiraTools(client: AtlassianClient, hooks: Hooks): OrchestratorTool[] {
  return [
    createAddCommentTool(client, hooks),
    createTransitionTool(client, hooks),
    createGetCommentsTool(client),
  ];
}

/** Tool: Add a comment to a Jira issue */
function createAddCommentTool(client: AtlassianClient, hooks: Hooks): OrchestratorTool {
  return {
    name: "jira_add_comment",
    description:
      "Add a comment to a Jira issue. Use this to provide updates, ask questions, " +
      "or share findings with the Jira ticket stakeholders. Optionally reply to an existing comment.",
    schema: {
      type: "object",
      properties: {
        ticketKey: {
          type: "string",
          description: "The Jira ticket key (e.g., AM-123)",
        },
        body: {
          type: "string",
          description: "The comment body in plain text or markdown",
        },
        replyToId: {
          type: "string",
          description:
            "Optional: The ID of an existing comment to reply to. Get comment IDs from jira_get_comments.",
        },
      },
      required: ["ticketKey", "body"],
    },
    execute: async (args, _ctx) => {
      const { ticketKey, body, replyToId } = args as {
        ticketKey: string;
        body: string;
        replyToId?: string;
      };
      try {
        await client.addComment(ticketKey, body, replyToId);

        // Emit hook for cross-plugin coordination
        // Note: We don't have the comment ID from addComment response, so we use a timestamp-based ID
        hooks.emit("jira:comment.added", {
          issueId: ticketKey,
          comment: {
            id: `comment-${Date.now()}`,
            author: "jiratown-agent",
            body,
          },
        });

        return {
          success: true,
          output: `Comment added to ${ticketKey}${replyToId ? ` (reply to comment ${replyToId})` : ""}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/** Tool: Transition a Jira issue to a new status */
function createTransitionTool(client: AtlassianClient, hooks: Hooks): OrchestratorTool {
  return {
    name: "jira_transition_issue",
    description:
      "Transition a Jira issue to a new status. Fetches available transitions and " +
      "matches by status name. Use when the agent has completed work or needs to " +
      "update the ticket status.",
    schema: {
      type: "object",
      properties: {
        ticketKey: {
          type: "string",
          description: "The Jira ticket key (e.g., AM-123)",
        },
        status: {
          type: "string",
          description: "The target status name (e.g., 'In Progress', 'Done', 'In Review')",
        },
      },
      required: ["ticketKey", "status"],
    },
    execute: async (args, _ctx) => {
      const { ticketKey, status } = args as {
        ticketKey: string;
        status: string;
      };
      try {
        // Get current issue to capture the "from" status
        const issue = await client.fetchIssue(ticketKey);
        const fromStatus = issue.fields.status.name;

        const transitions = await client.getTransitions(ticketKey);
        const transition = transitions.find((t) =>
          t.name.toLowerCase().includes(status.toLowerCase()),
        );

        if (!transition) {
          return {
            success: false,
            error: `No transition found for "${status}". Available: ${transitions.map((t) => t.name).join(", ")}`,
          };
        }

        await client.transitionIssue(ticketKey, transition.id);

        // Emit hook for cross-plugin coordination
        hooks.emit("jira:issue.transitioned", {
          issueId: ticketKey,
          from: fromStatus,
          to: transition.to.name,
        });

        return {
          success: true,
          output: `Transitioned ${ticketKey} to "${transition.to.name}"`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/** Tool: Get all comments from a Jira issue */
function createGetCommentsTool(client: AtlassianClient): OrchestratorTool {
  return {
    name: "jira_get_comments",
    description:
      "Get all comments from a Jira issue. Returns an array of comments with id, author, body, " +
      "creation timestamp, and parentId for threaded replies. Use the id field to reply to a specific comment.",
    schema: {
      type: "object",
      properties: {
        ticketKey: {
          type: "string",
          description: "The Jira ticket key (e.g., AM-123)",
        },
      },
      required: ["ticketKey"],
    },
    execute: async (args, _ctx) => {
      const { ticketKey } = args as { ticketKey: string };
      try {
        return {
          success: true,
          output: JSON.stringify(
            await client.fetchIssue(ticketKey).then(
              (issue) =>
                issue.fields.comment?.comments.map((c) => ({
                  id: c.id,
                  author: c.author.displayName,
                  body: c.body,
                  created: c.created,
                  parentId: c.parentId,
                })) ?? [],
            ),
            null,
            2,
          ),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
