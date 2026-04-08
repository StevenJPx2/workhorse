#!/usr/bin/env bun
/**
 * Test script to verify ticket spawning creates a tmux session
 * 
 * This simulates what happens in App.tsx when a ticket is added:
 * 1. Detects rig (git repo info)
 * 2. Loads config
 * 3. Creates a ticket in the database
 * 4. Calls spawnAgent() which creates worktree + tmux session
 * 
 * Run with: bun run scripts/test-spawn.ts
 */

import { detectRig } from "../src/lib/detect-rig";
import { loadConfig, configExists } from "../src/lib/config";
import { initDatabase, insertTicket, deleteTicket, getTicketsByRig } from "../src/lib/db";
import { spawnAgent, stopAgent, getAgent } from "../src/harness/orchestrator/orchestrator";
import { listSessions } from "../src/harness/session/tmux";
import { randomUUID } from "crypto";

const TEST_TICKET_KEY = "TEST-999";

async function main() {
  console.log("🧪 Testing ticket spawn flow...\n");

  // Step 1: Check prerequisites
  console.log("1️⃣  Checking prerequisites...");
  
  if (!configExists()) {
    console.error("❌ Config not found. Run 'jiratown setup' first.");
    process.exit(1);
  }
  
  const config = await loadConfig();
  if (!config) {
    console.error("❌ Failed to load config");
    process.exit(1);
  }
  console.log(`   ✓ Config loaded (cloud_id: ${config.jira.cloud_id})`);

  const rigInfo = await detectRig();
  if (!rigInfo) {
    console.error("❌ Not in a git repository");
    process.exit(1);
  }
  console.log(`   ✓ Rig detected: ${rigInfo.rig}`);
  console.log(`   ✓ Git root: ${rigInfo.gitRoot}`);

  // Step 2: Initialize database
  console.log("\n2️⃣  Initializing database...");
  initDatabase();
  console.log("   ✓ Database initialized");

  // Clean up any existing test ticket
  const existingTickets = getTicketsByRig(rigInfo.rig);
  const existing = existingTickets.find(t => t.jira_key === TEST_TICKET_KEY);
  if (existing) {
    console.log(`   ⚠ Cleaning up existing test ticket: ${existing.id}`);
    deleteTicket(existing.id);
  }

  // Step 3: Create a test ticket
  console.log("\n3️⃣  Creating test ticket...");
  const ticketId = randomUUID();
  const ticket = insertTicket({
    id: ticketId,
    jira_key: TEST_TICKET_KEY,
    rig: rigInfo.rig,
    summary: "Test ticket for spawn verification",
    agent: "opencode",
  });
  console.log(`   ✓ Ticket created: ${ticket.id}`);

  // Step 4: Check tmux sessions BEFORE spawn
  console.log("\n4️⃣  Checking tmux sessions before spawn...");
  const sessionsBefore = await listSessions();
  console.log(`   Sessions before: ${sessionsBefore.length}`);
  sessionsBefore.forEach(s => console.log(`     - ${s.name}`));

  // Step 5: Spawn agent (this is what workflow.startWork() does internally)
  console.log("\n5️⃣  Spawning agent...");
  console.log(`   repoPath: ${rigInfo.gitRoot}`);
  console.log(`   jiraCloudId: ${config.jira.cloud_id}`);
  
  const result = await spawnAgent({
    ticketId: ticket.id,
    agentType: "opencode",
    repoPath: rigInfo.gitRoot,
    issueType: "Task",
    jiraCloudId: config.jira.cloud_id,
    jiraSummary: "Test ticket for spawn verification",
    jiraDescription: "This is a test to verify tmux session creation",
  });

  if (result.success) {
    console.log("   ✓ Agent spawned successfully!");
    console.log(`   State: ${result.instance?.state}`);
    console.log(`   Worktree: ${result.instance?.worktree?.path}`);
    console.log(`   Session: ${result.instance?.session?.name}`);
  } else {
    console.log(`   ❌ Agent spawn failed: ${result.error}`);
  }

  // Step 6: Check tmux sessions AFTER spawn
  console.log("\n6️⃣  Checking tmux sessions after spawn...");
  const sessionsAfter = await listSessions();
  console.log(`   Sessions after: ${sessionsAfter.length}`);
  sessionsAfter.forEach(s => console.log(`     - ${s.name} (ticket: ${s.ticketId})`));

  // Step 7: Verify the agent is tracked
  console.log("\n7️⃣  Verifying agent tracking...");
  const agent = getAgent(ticket.id);
  if (agent) {
    console.log(`   ✓ Agent found in orchestrator`);
    console.log(`   State: ${agent.state}`);
  } else {
    console.log("   ❌ Agent not found in orchestrator");
  }

  // Step 8: Cleanup
  console.log("\n8️⃣  Cleaning up...");
  if (result.success) {
    const stopResult = await stopAgent(ticket.id, rigInfo.gitRoot, true);
    if (stopResult.success) {
      console.log("   ✓ Agent stopped and worktree removed");
    } else {
      console.log(`   ⚠ Failed to stop agent: ${stopResult.error}`);
    }
  }
  deleteTicket(ticket.id);
  console.log("   ✓ Test ticket deleted");

  // Final check
  console.log("\n9️⃣  Final session check...");
  const sessionsFinal = await listSessions();
  console.log(`   Sessions remaining: ${sessionsFinal.length}`);

  // Summary
  console.log("\n" + "=".repeat(50));
  if (result.success && sessionsAfter.length > sessionsBefore.length) {
    console.log("✅ SUCCESS: Tmux session was created when spawning agent!");
  } else if (!result.success) {
    console.log("❌ FAILED: Agent spawn failed - " + result.error);
  } else {
    console.log("⚠️  UNCLEAR: Agent spawned but no new tmux session detected");
  }
}

main().catch(console.error);
