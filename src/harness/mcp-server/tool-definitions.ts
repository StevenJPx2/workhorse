import { z } from "zod";
import { TOOL_NAMES } from "./tool-names.ts";

const GetNotificationsSchema = z.object({});

const AcknowledgeSchema = z.object({
  notification_ids: z
    .array(z.string())
    .describe("IDs of notifications to acknowledge"),
});

const UpdateStatusSchema = z.object({
  status: z
    .enum([
      "pending",
      "queued",
      "planning",
      "implementing",
      "blocked",
      "testing",
      "pr_created",
      "in_review",
      "done",
    ])
    .describe(
      "New status for the ticket workflow. Use: " +
      "'pending' (not started), 'planning' (analyzing requirements), " +
      "'implementing' (writing code), 'blocked' (needs input), " +
      "'pr_created' (PR opened), 'in_review' (awaiting review), " +
      "'done' (complete)"
    ),
  message: z.string().optional().describe("Optional status update message"),
});

const EscalateSchema = z.object({
  questions: z
    .array(z.string())
    .min(1)
    .describe("Questions to ask the user"),
  context: z.string().describe("Context about what you were working on"),
  blocking: z
    .boolean()
    .describe("Whether this blocks further work on the ticket"),
});

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: TOOL_NAMES.GET_NOTIFICATIONS,
      description:
        "Get pending notifications for this ticket. Returns notifications " +
        "from Jira comments, GitHub PR reviews, and system events. " +
        "Call this at the start of work and periodically to check for updates.",
      inputSchema: GetNotificationsSchema,
    },
    {
      name: TOOL_NAMES.ACKNOWLEDGE,
      description:
        "Acknowledge notifications after addressing them. " +
        "This marks them as handled so they won't appear again.",
      inputSchema: AcknowledgeSchema,
    },
    {
      name: TOOL_NAMES.UPDATE_STATUS,
      description:
        "Update the ticket's workflow status in Jiratown. IMPORTANT: Call this tool " +
        "whenever you transition between work phases (e.g., starting implementation, " +
        "creating a PR, completing work). If the ticket is already complete or no work " +
        "is needed, set status to 'done'. This updates the TUI display.",
      inputSchema: UpdateStatusSchema,
    },
    {
      name: TOOL_NAMES.ESCALATE,
      description:
        "Escalate questions or issues to the user. Use this when you need " +
        "clarification or are blocked. Set blocking=true if you cannot proceed " +
        "without an answer.",
      inputSchema: EscalateSchema,
    },
  ];
}