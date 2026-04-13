#!/usr/bin/env bun
/**
 * Test script for agent SDK connection
 *
 * Usage: bun run scripts/test-agent-sdk.ts [ticketId]
 *
 * Tests:
 * 1. Port allocation for tickets
 * 2. SDK client creation
 * 3. Session listing
 * 4. Message fetching
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import {
  getPortForTicket,
  getAllocatedPorts,
} from "../src/harness/orchestrator/opencode-client/port-manager.ts";
import {
  getAgentStatus,
  clearAllSessionCache,
} from "../src/hooks/use-agent-summary/get-agent-status.ts";

const ticketId = process.argv[2] || "ADEPT-37632";
const worktreePath =
  process.argv[3] || `/Users/stevenjohn/Documents/Projects/jiratown-worktrees/${ticketId}`;

console.log("=== Agent SDK Connection Test ===\n");

// Test 1: Port allocation
console.log("1. Port Allocation");
const port = getPortForTicket(ticketId);
console.log(`   Ticket: ${ticketId}`);
console.log(`   Allocated Port: ${port}`);
console.log(`   Expected: >= 14100 (not 4096)`);
console.log(`   ✓ Port is correct: ${port >= 14100 && port !== 4096 ? "PASS" : "FAIL"}\n`);

// Test 2: Check if agent is running on that port
console.log("2. Agent Connectivity");
const baseUrl = `http://localhost:${port}`;
console.log(`   URL: ${baseUrl}`);

try {
  const response = await fetch(`${baseUrl}/session`, {
    method: "GET",
    signal: AbortSignal.timeout(2000),
  });

  if (response.ok) {
    const sessions = await response.json();
    console.log(`   ✓ Agent responding: PASS`);
    console.log(`   Sessions found: ${sessions.length}`);
  } else {
    console.log(`   ✗ Agent not responding: HTTP ${response.status}`);
  }
} catch (err) {
  console.log(`   ✗ Agent not running on port ${port}`);
  console.log(`   Error: ${err instanceof Error ? err.message : err}`);
  console.log("\n   Hint: Start the agent with 's' key in the TUI");
}

// Test 3: SDK client creation and session listing
console.log("\n3. SDK Client Test");
try {
  const client = createOpencodeClient({ baseUrl });
  console.log(`   ✓ Client created for ${baseUrl}`);

  const sessions = await client.session.list({
    query: { directory: worktreePath },
  });

  if (sessions.data?.length) {
    console.log(`   ✓ Found ${sessions.data.length} session(s) for worktree`);

    // Get the most recent session
    const latestSession = sessions.data.sort(
      (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0),
    )[0];

    console.log(`   Latest session: ${latestSession.id}`);
    console.log(`   Title: ${latestSession.title || "(no title)"}`);
    console.log(
      `   Updated: ${new Date((latestSession.time?.updated ?? 0) * 1000).toLocaleTimeString()}`,
    );
  } else {
    console.log(`   No sessions found for directory: ${worktreePath}`);
  }
} catch (err) {
  console.log(`   ✗ SDK client error: ${err instanceof Error ? err.message : err}`);
}

// Test 4: Full getAgentStatus function
console.log("\n4. getAgentStatus() Test");
clearAllSessionCache(); // Clear cache for fresh test

try {
  const steps = await getAgentStatus(ticketId, worktreePath);

  if (steps.length > 0) {
    console.log(`   ✓ Got ${steps.length} step(s) from agent`);
    console.log(`   Latest: "${steps[0].description.substring(0, 60)}..."`);
    console.log(`   Type: ${steps[0].type}`);
  } else {
    console.log(`   No steps returned (agent may be idle or not running)`);
  }
} catch (err) {
  console.log(`   ✗ Error: ${err instanceof Error ? err.message : err}`);
}

// Summary
console.log("\n=== Summary ===");
console.log(`Ticket: ${ticketId}`);
console.log(`Port: ${port}`);
console.log(`Worktree: ${worktreePath}`);

// Show all allocated ports
const allPorts = getAllocatedPorts();
if (allPorts.size > 0) {
  console.log("\nAll allocated ports:");
  for (const [tid, p] of allPorts) {
    console.log(`  ${tid}: ${p}`);
  }
}
