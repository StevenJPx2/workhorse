/**
 * Add command runner
 *
 * Fetches ticket details from Jira via Atlassian MCP and adds to local DB.
 */

import * as p from "@clack/prompts";
import { detectRig } from "../../lib/detect-rig.ts";
import { loadConfig, configExists } from "../../lib/config.ts";
import {
  insertTicket,
  getTicketById,
  updateTicket,
  initDatabase,
} from "../../lib/db.ts";
import type { AgentType } from "../../types/config.ts";
import { parseTicketKey, isValidTicketKey } from "./parse-ticket.ts";
import {
  createAtlassianClient,
  type JiraIssue,
} from "../../hooks/use-atlassian/index.ts";

export interface AddOptions {
  agent?: string;
  /** Skip fetching from Jira (offline mode) */
  offline?: boolean;
}

/**
 * Run the add command
 */
export async function runAdd(ticket: string, options: AddOptions): Promise<void> {
  // Check if setup has been run
  if (!configExists()) {
    p.log.error("Jiratown is not configured. Run 'jiratown setup' first.");
    process.exit(1);
  }

  // Detect rig from current directory
  const rigInfo = await detectRig();
  if (!rigInfo) {
    p.log.error(
      "Not in a git repository with a remote. Please run from a git repo."
    );
    process.exit(1);
  }

  // Parse and validate ticket input
  const { key: ticketKey, url: ticketUrl } = parseTicketKey(ticket);

  if (!isValidTicketKey(ticketKey)) {
    p.log.error(`Invalid ticket key format: "${ticketKey}"`);
    p.log.message("Expected format: PROJECT-123 (e.g., AM-123, JIRA-456)");
    process.exit(1);
  }

  // Check if ticket already exists
  const existing = getTicketById(ticketKey);
  if (existing) {
    p.log.warn(`Ticket ${ticketKey} already exists with status: ${existing.status}`);
    const shouldUpdate = await p.confirm({
      message: "Update the existing ticket?",
      initialValue: false,
    });

    if (p.isCancel(shouldUpdate) || !shouldUpdate) {
      p.outro("Cancelled.");
      return;
    }
  }

  // Load config for defaults
  const config = await loadConfig();

  // Determine agent
  const agent: AgentType =
    (options.agent as AgentType) || config.defaults.agent;

  if (agent !== "opencode" && agent !== "claude") {
    p.log.error(`Invalid agent: "${agent}". Must be "opencode" or "claude".`);
    process.exit(1);
  }

  // Initialize database
  initDatabase();

  // Fetch ticket details from Jira
  let jiraIssue: JiraIssue | null = null;
  const spinner = p.spinner();

  if (!options.offline) {
    spinner.start(`Fetching ${ticketKey} from Jira...`);

    try {
      const client = createAtlassianClient({ cloudId: config.jira.cloud_id });
      await client.connect();
      jiraIssue = await client.fetchIssue(ticketKey);
      await client.disconnect();
      spinner.stop(`Fetched: ${jiraIssue.summary}`);
    } catch (error) {
      spinner.stop("Failed to fetch from Jira");
      const message = error instanceof Error ? error.message : String(error);
      p.log.warn(`Could not fetch ticket from Jira: ${message}`);
      p.log.message("Continuing with basic ticket info...");
    }
  }

  // Insert or update ticket
  spinner.start(existing ? `Updating ticket ${ticketKey}...` : `Adding ticket ${ticketKey}...`);

  try {
    if (existing) {
      // Update existing ticket with fresh Jira data
      updateTicket(ticketKey, {
        summary: jiraIssue?.summary ?? existing.summary,
        jira_url: jiraIssue?.url ?? ticketUrl ?? existing.jira_url,
        agent,
        last_jira_sync: jiraIssue ? new Date().toISOString() : existing.last_jira_sync,
      });
      spinner.stop(`Updated ticket ${ticketKey}`);
    } else {
      const newTicket = insertTicket({
        id: ticketKey,
        jira_key: ticketKey,
        rig: rigInfo.rig,
        jira_url: jiraIssue?.url ?? ticketUrl,
        summary: jiraIssue?.summary,
        agent,
      });

      spinner.stop(`Added ticket ${ticketKey}`);

      p.log.success(`Ticket: ${newTicket.id}`);
      if (jiraIssue) {
        p.log.message(`  Summary: ${jiraIssue.summary}`);
        p.log.message(`  Status: ${jiraIssue.status}`);
        p.log.message(`  Type: ${jiraIssue.issueType}`);
      }
      p.log.message(`  Rig: ${newTicket.rig}`);
      p.log.message(`  Agent: ${newTicket.agent}`);
      if (newTicket.jira_url) {
        p.log.message(`  URL: ${newTicket.jira_url}`);
      }
    }
  } catch (error) {
    spinner.stop("Failed to add ticket");
    p.log.error(String(error));
    process.exit(1);
  }

  p.outro(`Run 'jiratown' to view and manage tickets.`);
}
