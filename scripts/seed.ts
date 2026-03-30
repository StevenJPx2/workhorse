#!/usr/bin/env bun
/**
 * Seed script for adding dummy tickets to test the UI
 *
 * Usage:
 *   bun run scripts/seed.ts
 */

import { initDatabase, insertTicket, getTicketById, updateTicket } from "../src/lib/db.ts";
import { detectRig } from "../src/lib/detect-rig.ts";
import type { TicketStatus } from "../src/types/ticket.ts";
import type { AgentType } from "../src/types/config.ts";

interface DummyTicket {
  id: string;
  summary: string;
  status: TicketStatus;
  agent: AgentType;
}

const dummyTickets: DummyTicket[] = [
  {
    id: "JT-101",
    summary: "Add user authentication flow",
    status: "implementing",
    agent: "opencode",
  },
  {
    id: "JT-102",
    summary: "Fix database connection pooling",
    status: "pr_created",
    agent: "claude",
  },
  {
    id: "JT-103",
    summary: "Implement dark mode toggle",
    status: "pending",
    agent: "opencode",
  },
  {
    id: "JT-104",
    summary: "Refactor API error handling",
    status: "blocked",
    agent: "claude",
  },
  {
    id: "JT-105",
    summary: "Add unit tests for utils",
    status: "planning",
    agent: "opencode",
  },
  {
    id: "JT-106",
    summary: "Update dependencies to latest versions",
    status: "in_review",
    agent: "claude",
  },
  {
    id: "JT-107",
    summary: "Optimize bundle size",
    status: "queued",
    agent: "opencode",
  },
  {
    id: "JT-108",
    summary: "Fix memory leak in websocket handler",
    status: "done",
    agent: "claude",
  },
];

async function main() {
  console.log("Initializing database...");
  initDatabase();

  console.log("Detecting rig...");
  const rigInfo = await detectRig();
  if (!rigInfo) {
    console.error("Could not detect rig. Run this from within a git repository.");
    process.exit(1);
  }
  console.log(`Rig: ${rigInfo.rig}`);

  console.log("\nSeeding dummy tickets...");
  for (const ticket of dummyTickets) {
    const existing = getTicketById(ticket.id);
    if (existing) {
      console.log(`  Updating ${ticket.id}: ${ticket.summary}`);
      updateTicket(ticket.id, {
        summary: ticket.summary,
        status: ticket.status,
        agent: ticket.agent,
      });
    } else {
      console.log(`  Creating ${ticket.id}: ${ticket.summary}`);
      insertTicket({
        id: ticket.id,
        jira_key: ticket.id,
        rig: rigInfo.rig,
        summary: ticket.summary,
        agent: ticket.agent,
      });
      // Update status after insert since insertTicket doesn't support status
      updateTicket(ticket.id, { status: ticket.status });
    }
  }

  console.log(`\nSeeded ${dummyTickets.length} dummy tickets.`);
  console.log("Run 'bun run dev' to see them in the dashboard.");
}

main().catch(console.error);
