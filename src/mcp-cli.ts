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

// Create MCP server
const { server } = createJiratownServer(db, ticketId);

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
