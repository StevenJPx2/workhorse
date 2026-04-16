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
import type { PRCreatedEvent } from "./core/mcp-server/types.ts";
import type { GitHubReview, GitHubComment } from "./core/pollers/types.ts";

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

const ticketId = values.ticket || process.env.JIRATOWN_TICKET_ID;

if (!ticketId) {
  console.error("Error: --ticket <ticketId> is required");
  process.exit(1);
}

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

// Stub implementations for GitHub API calls
// These will be replaced with actual gh CLI calls or GitHub MCP integration
async function fetchGitHubReviews(
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<GitHubReview[]> {
  // TODO: Implement using `gh api` or GitHub MCP
  // For now, return empty array - notifications will be created when reviews are fetched
  try {
    const result =
      await Bun.$`gh api repos/${_owner}/${_repo}/pulls/${_prNumber}/reviews --jq '[.[] | {id: .id, user: .user.login, state: .state, body: .body, submittedAt: .submitted_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

async function fetchGitHubComments(
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<GitHubComment[]> {
  // TODO: Implement using `gh api` or GitHub MCP
  try {
    const result =
      await Bun.$`gh api repos/${_owner}/${_repo}/pulls/${_prNumber}/comments --jq '[.[] | {id: .id, user: .user.login, body: .body, path: .path, line: .line, createdAt: .created_at, updatedAt: .updated_at}]'`.text();
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

/**
 * Handle PR creation event - starts GitHub poller for immediate feedback
 */
function handlePRCreated(event: PRCreatedEvent): void {
  console.error(`[jiratown-mcp] PR created: ${event.prUrl} - starting GitHub poller`);

  const poller = createGitHubPoller({
    db,
    ticketId: event.ticketId,
    prNumber: event.prNumber,
    interval: GITHUB_POLL_INTERVAL,
    autoStart: false, // We'll start manually after initial poll
    fetchReviews: (prNumber) => fetchGitHubReviews(event.owner, event.repo, prNumber),
    fetchComments: (prNumber) => fetchGitHubComments(event.owner, event.repo, prNumber),
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

// Create MCP server with PR creation callback
const { server } = createJiratownServer(db, ticketId, {
  onPRCreated: handlePRCreated,
});

// Connect via stdio
const transport = new StdioServerTransport();

async function main() {
  try {
    await server.connect(transport);
  } catch (error) {
    console.error("MCP server error:", error);
    process.exit(1);
  }
}

main();
