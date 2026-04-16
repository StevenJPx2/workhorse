/**
 * jiratown_open_pr tool handler
 *
 * Opens a GitHub PR for the current ticket's branch using the gh CLI.
 * Updates the ticket's pr_url and status to pr_created.
 */

import type { Database } from "bun:sqlite";
import { $ } from "bun";
import type { OpenPRInput, OpenPRResponse } from "../types.ts";

interface TicketRow {
  id: string;
  jira_key: string;
  branch_name: string | null;
  worktree_path: string | null;
  rig: string;
  status: string;
}

/**
 * Handle the jiratown_open_pr tool call
 *
 * Creates a PR using the gh CLI, updates ticket with pr_url,
 * and transitions status to pr_created.
 */
export async function handleOpenPR(
  db: Database,
  ticketId: string,
  input: OpenPRInput,
): Promise<OpenPRResponse> {
  // Get ticket info
  const ticket = db
    .prepare(
      "SELECT id, jira_key, branch_name, worktree_path, rig, status FROM tickets WHERE id = ?",
    )
    .get(ticketId) as TicketRow | null;

  if (!ticket) {
    return {
      success: false,
      message: `Ticket ${ticketId} not found`,
    };
  }

  if (!ticket.worktree_path) {
    return {
      success: false,
      message: "No worktree path set for this ticket",
    };
  }

  if (!ticket.branch_name) {
    return {
      success: false,
      message: "No branch name set for this ticket",
    };
  }

  const baseBranch = input.base_branch ?? "main";

  try {
    // Use gh CLI to create PR from the worktree directory
    const result =
      await $`gh pr create --title ${input.title} --body ${input.body} --base ${baseBranch} --head ${ticket.branch_name}`
        .cwd(ticket.worktree_path)
        .text();

    // gh pr create outputs the PR URL on success
    const prUrl = result.trim();

    if (!prUrl.includes("github.com") && !prUrl.includes("/pull/")) {
      return {
        success: false,
        message: `Unexpected gh output: ${prUrl}`,
      };
    }

    // Extract owner, repo, and PR number from URL (e.g., https://github.com/owner/repo/pull/123)
    const prMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    const owner = prMatch ? prMatch[1] : undefined;
    const repo = prMatch ? prMatch[2] : undefined;
    const prNumber = prMatch ? parseInt(prMatch[3], 10) : undefined;

    // Update ticket with PR URL and status
    db.prepare(
      "UPDATE tickets SET pr_url = ?, status = 'pr_created', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(prUrl, ticketId);

    return {
      success: true,
      pr_url: prUrl,
      pr_number: prNumber,
      owner,
      repo,
      message:
        `PR created successfully: ${prUrl}\n\n` +
        `**IMPORTANT: Now update the Jira ticket (${ticket.jira_key}):**\n` +
        `1. Add a comment with the PR URL using mcp_atlassian_addCommentToJiraIssue\n` +
        `2. Transition the ticket status (e.g., to 'In Review') using mcp_atlassian_transitionJiraIssue`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to create PR: ${errorMessage}`,
    };
  }
}
