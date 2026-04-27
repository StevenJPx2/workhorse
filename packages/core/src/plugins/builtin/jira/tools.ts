/**
 * Jira tools registered with the orchestrator.
 *
 * @module plugins/builtin/jira/tools
 */

import type { OrchestratorTool } from "../../../workflow/orchestrator/types/tools.ts";
import type { AtlassianClient } from "./client.ts";

/** Create Jira tool definitions bound to a client */
export function createJiraTools(client: AtlassianClient): OrchestratorTool[] {
  return [createAddCommentTool(client), createTransitionTool(client)];
}

/** Tool: Add a comment to a Jira issue */
function createAddCommentTool(client: AtlassianClient): OrchestratorTool {
  return {
    name: "jira_add_comment",
    description:
      "Add a comment to a Jira issue. Use this to provide updates, ask questions, " +
      "or share findings with the Jira ticket stakeholders.",
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
      },
      required: ["ticketKey", "body"],
    },
    execute: async (args, _ctx) => {
      const { ticketKey, body } = args as { ticketKey: string; body: string };
      try {
        await client.addComment(ticketKey, body);
        return { success: true, output: `Comment added to ${ticketKey}` };
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
function createTransitionTool(client: AtlassianClient): OrchestratorTool {
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
      const { ticketKey, status } = args as { ticketKey: string; status: string };
      try {
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
