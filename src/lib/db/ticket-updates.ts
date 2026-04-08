/**
 * Ticket update operations (partial updates)
 */

import { getDatabase } from "./connection.ts";
import type { Ticket } from "../../types/ticket.ts";

/**
 * Update ticket fields
 */
export function updateTicket(
  id: string,
  updates: Partial<
    Pick<
      Ticket,
      | "summary"
      | "jira_url"
      | "worktree_path"
      | "branch_name"
      | "agent"
      | "agent_pid"
      | "pr_url"
      | "last_jira_sync"
      | "status"
    >
  >
): void {
  const db = getDatabase();

  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.summary !== undefined) {
    fields.push("summary = ?");
    values.push(updates.summary);
  }
  if (updates.jira_url !== undefined) {
    fields.push("jira_url = ?");
    values.push(updates.jira_url);
  }
  if (updates.worktree_path !== undefined) {
    fields.push("worktree_path = ?");
    values.push(updates.worktree_path);
  }
  if (updates.branch_name !== undefined) {
    fields.push("branch_name = ?");
    values.push(updates.branch_name);
  }
  if (updates.agent !== undefined) {
    fields.push("agent = ?");
    values.push(updates.agent);
  }
  if (updates.agent_pid !== undefined) {
    fields.push("agent_pid = ?");
    values.push(updates.agent_pid);
  }
  if (updates.pr_url !== undefined) {
    fields.push("pr_url = ?");
    values.push(updates.pr_url);
  }
  if (updates.last_jira_sync !== undefined) {
    fields.push("last_jira_sync = ?");
    values.push(updates.last_jira_sync);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return;
  }

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const sql = `UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`;
  db.prepare(sql).run(...values);
}
