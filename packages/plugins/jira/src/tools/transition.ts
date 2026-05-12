/**
 * Jira Transition Issue tool.
 *
 * @module workhorse-plugin-jira/tools/transition
 */

import type { OrchestratorTool } from "workhorse-core";
import type { AtlassianClient } from "../client.ts";
import type { Hooks } from "./types.ts";

/** Tool: Transition a Jira issue to a new status */
export function createTransitionTool(client: AtlassianClient, hooks: Hooks): OrchestratorTool {
  return {
    name: "jira_transition_issue",
    description:
      "Transition a Jira issue to a new status. Fetches available transitions and " +
      "matches by status name. Use when the agent has completed work or needs to " +
      "update the ticket status. Only works for Jira-sourced issues.",
    schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "The target status name (e.g., 'In Progress', 'Done', 'In Review')",
        },
      },
      required: ["status"],
    },
    execute: async (args, ctx) => {
      const { status } = args as {
        status: string;
      };
      try {
        // Check if current issue is from Jira
        const issue = await ctx.db.issues.getById(ctx.issueId);
        if (!issue || issue.source !== "jira") {
          return {
            success: false,
            error: "This tool only works for Jira-sourced issues",
          };
        }

        const ticketKey = issue.externalId;
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
          from: await client.fetchIssue(ticketKey).then((r) => r.fields.status.name),
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
