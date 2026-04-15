/**
 * Diagnostic script: test agent start flow for a given ticket
 * Usage: bun run scripts/diagnose-start.ts
 * Run from the target repo directory
 */

import { join } from "node:path";

// Simulate what src/cli/index.ts does at startup
if (!process.env.JIRATOWN_ROOT) {
  process.env.JIRATOWN_ROOT = join(import.meta.dir, "../dist");
}

import { initDatabase } from "#core/db/index.ts";
import { detectRig } from "#core/git/detect-rig.ts";
import { restartTicketAgent } from "#core/workflow/ticket-agent/restart.ts";
import {
  getTicketById as dbGetTicketById,
  getAllTickets as dbGetAllTickets,
  updateTicketStatus,
  updateTicket,
  insertTicketEvent,
} from "#core/db/index.ts";

const dbOps = {
  getTicketById: dbGetTicketById,
  getAllTickets: dbGetAllTickets,
  updateTicketStatus,
  updateTicket,
  insertTicketEvent,
};

console.log("=== Jiratown Start Diagnostics ===\n");
console.log("CWD:", process.cwd());

// 1. Detect rig
const rig = await detectRig();
console.log("Rig:", rig);

if (!rig) {
  console.error("❌ No rig detected - not in a git repo with a remote?");
  process.exit(1);
}

// 2. Init DB and list tickets
initDatabase();
const tickets = dbGetAllTickets();
console.log(`\nTickets in DB: ${tickets.length}`);
for (const t of tickets) {
  console.log(
    `  - [${t.id}] ${t.jira_key} | status: ${t.status} | agent: ${t.agent} | rig: ${t.rig}`,
  );
}

if (tickets.length === 0) {
  console.error("❌ No tickets in DB");
  process.exit(1);
}

// Pick first pending ticket for this rig
const ticket = tickets.find((t) => t.rig === rig.rig && t.status === "pending") ?? tickets[0];
console.log(`\nTesting with ticket: ${ticket.jira_key} (${ticket.id})`);
console.log("  repoPath:", rig.gitRoot);
console.log("  agent:", ticket.agent);

// 3. Try to restart agent
console.log("\n--- Calling restartTicketAgent ---");
const result = await restartTicketAgent(ticket.id, rig.gitRoot, dbOps);
console.log("\nResult:", JSON.stringify(result, null, 2));

if (!result.success) {
  console.error("\n❌ Failed:", result.error);
} else {
  console.log("\n✅ Success!");
}
