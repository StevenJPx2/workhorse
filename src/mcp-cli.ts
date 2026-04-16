#!/usr/bin/env bun
/**
 * Jiratown MCP Server CLI
 *
 * This is the entry point for the MCP server that agents connect to.
 * It provides tools for agents to interact with Jiratown (update status, escalate, etc.)
 *
 * Usage: bun run jiratown-mcp --ticket <ticketId>
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "util";
import { Database } from "bun:sqlite";
import { createJiratownServer } from "./core/mcp-server/server.ts";
import { createGitHubPoller } from "./core/pollers/github-poller.ts";
import { fetchGitHubReviews, fetchGitHubComments } from "./core/pollers/github-fetcher.ts";
import type { PRCreatedEvent } from "./core/mcp-server/types.ts";

// Parse command line arguments
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    ticket: { type: "string", short: "t" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`
Jiratown MCP Server

Usage: bun run jiratown-mcp --ticket <ticketId>

Options:
  -t, --ticket <id>  Ticket ID to work on (required)
  -h, --help         Show this help message
`);
  process.exit(0);
}

const ticketIdArg = values.ticket || process.env.JIRATOWN_TICKET_ID;

if (!ticketIdArg) {
  console.error("Error: --ticket <ticketId> is required");
  process.exit(1);
}

const ticketId: string = ticketIdArg;

// Get database path from environment or use default (~/.jiratown/jiratown.db)
const dbPath = process.env.JIRATOWN_DB_PATH || `${process.env.HOME}/.jiratown/jiratown.db`;

// Open database
let db: Database;
try {
  db = new Database(dbPath);
} catch (error) {
  console.error(`Error opening database at ${dbPath}:`, error);
  process.exit(1);
}

// GitHub polling interval (30 seconds)
const GITHUB_POLL_INTERVAL = 30_000;

/**
 * Start GitHub poller for a PR
 */
function startGitHubPoller(
  ticketId: string,
  owner: string,
  repo: string,
  prNumber: number,
  prUrl: string,
): void {
  console.error(`[jiratown-mcp] Starting GitHub poller for PR: ${prUrl}`);

  const poller = createGitHubPoller({
    db,
    ticketId,
    prNumber,
    interval: GITHUB_POLL_INTERVAL,
    autoStart: false, // We'll start manually after initial poll
    fetchReviews: (prNum) => fetchGitHubReviews(owner, repo, prNum),
    fetchComments: (prNum) => fetchGitHubComments(owner, repo, prNum),
    onNewReviews: (reviews) => {
      console.error(`[jiratown-mcp] New reviews detected: ${reviews.length}`);
    },
    onNewComments: (comments) => {
      console.error(`[jiratown-mcp] New comments detected: ${comments.length}`);
    },
    onError: (error) => {
      console.error(`[jiratown-mcp] GitHub polling error: ${error.message}`);
    },
  });

  // Perform immediate poll, then start interval polling
  poller.poll().then(() => {
    console.error(`[jiratown-mcp] Initial GitHub poll complete, starting interval polling`);
    poller.start();
  });
}

/**
 * Handle PR creation event - starts GitHub poller for immediate feedback
 */
function handlePRCreated(event: PRCreatedEvent): void {
  startGitHubPoller(event.ticketId, event.owner, event.repo, event.prNumber, event.prUrl);
}

/**
 * Check if ticket already has a PR and start polling if so
 */
function initializeGitHubPollerForExistingPR(): void {
  try {
    const ticket = db
      .prepare("SELECT pr_url, pr_number FROM tickets WHERE id = ?")
      .get(ticketId) as { pr_url: string | null; pr_number: number | null } | undefined;

    if (ticket?.pr_url && ticket?.pr_number) {
      // Parse PR URL: https://github.com/owner/repo/pull/123
      const match = ticket.pr_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
      if (match) {
        const [, owner, repo] = match;
        console.error(`[jiratown-mcp] Ticket already has PR, starting GitHub poller`);
        startGitHubPoller(ticketId, owner, repo, ticket.pr_number, ticket.pr_url);
      }
    }
  } catch (error) {
    console.error(`[jiratown-mcp] Failed to check for existing PR:`, error);
  }
}

// Create MCP server with PR creation callback
const { server } = createJiratownServer(db, ticketId, {
  onPRCreated: handlePRCreated,
});

// Connect via stdio
const transport = new StdioServerTransport();

async function main() {
  try {
    // Start GitHub poller if ticket already has a PR (for resumed tickets)
    initializeGitHubPollerForExistingPR();

    await server.connect(transport);
  } catch (error) {
    console.error("MCP server error:", error);
    process.exit(1);
  }
}

main();
