/**
 * jiratown_escalate tool handler
 *
 * Creates an escalation notification with questions for the user.
 * Optionally marks the ticket as blocked.
 */

import type { Database } from "bun:sqlite";
import { createNotification } from "../../notifications/index.ts";
import type { EscalateInput, EscalateResponse } from "../types.ts";

interface TicketRow {
  id: string;
  jira_key: string;
}

/**
 * Format questions and context into notification content
 */
function formatEscalationContent(
  questions: string[],
  context: string
): string {
  const parts: string[] = [];

  parts.push("## Agent Escalation");
  parts.push("");
  parts.push("### Context");
  parts.push(context);
  parts.push("");
  parts.push("### Questions");

  for (let i = 0; i < questions.length; i++) {
    parts.push(`${i + 1}. ${questions[i]}`);
  }

  return parts.join("\n");
}

/**
 * Handle the jiratown_escalate tool call
 *
 * Creates a notification with the escalation questions and context.
 * If blocking=true, also updates the ticket status to 'blocked'.
 */
export function handleEscalate(
  db: Database,
  ticketId: string,
  input: EscalateInput
): EscalateResponse {
  // Check ticket exists
  const ticket = db
    .prepare("SELECT id, jira_key FROM tickets WHERE id = ?")
    .get(ticketId) as TicketRow | null;

  if (!ticket) {
    return {
      success: false,
      message: `Ticket ${ticketId} not found`,
    };
  }

  // Create notification
  const content = formatEscalationContent(input.questions, input.context);
  const summary = input.blocking
    ? `BLOCKED: Agent needs clarification (${input.questions.length} question(s))`
    : `Agent has questions (${input.questions.length})`;

  const notification = createNotification(db, {
    ticket_id: ticketId,
    source_type: "system",
    source_id: `escalation-${Date.now()}`,
    priority: input.blocking ? "blocking" : "high",
    summary,
    content,
    author: "Agent",
    metadata: {
      questions: input.questions,
      context: input.context,
      blocking: input.blocking,
    },
  });

  // Update ticket status if blocking
  if (input.blocking) {
    db.prepare(
      "UPDATE tickets SET status = 'blocked', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(ticketId);
  }

  return {
    success: true,
    message: input.blocking
      ? "Escalation posted. Ticket marked as blocked."
      : "Escalation posted. Continuing work.",
    notification_id: notification?.id,
  };
}
