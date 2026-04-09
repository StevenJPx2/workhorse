#!/usr/bin/env bun
/**
 * Integration test for OpenCode SDK integration
 *
 * This script tests the full flow:
 * 1. Port allocation
 * 2. Command building with --port flag
 * 3. Health check behavior (expects failure without real server)
 * 4. Status check behavior
 *
 * Run with: bun scripts/test-opencode-integration.ts
 */

import {
  getPortForTicket,
  releasePort,
  getAllocatedPorts,
  buildOpenCodeCommandWithPort,
  checkOpenCodeHealth,
  getOpenCodeStatus,
  createClientForTicket,
} from "../src/harness/orchestrator/opencode-client.ts";

import { buildAgentCommand } from "../src/harness/orchestrator/mcp-config.ts";

const C = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", blue: "\x1b[34m", reset: "\x1b[0m" };
const log = (msg: string) => console.log(`${C.blue}[TEST]${C.reset} ${msg}`);
const pass = (msg: string) => console.log(`${C.green}  ✓${C.reset} ${msg}`);
const fail = (msg: string) => console.log(`${C.red}  ✗${C.reset} ${msg}`);
const section = (name: string) => console.log(`\n${C.yellow}━━━ ${name} ━━━${C.reset}`);

async function runTests() {
  let passed = 0;
  let failed = 0;

  section("Port Allocation");

  // Clear any existing allocations
  for (const ticketId of getAllocatedPorts().keys()) {
    releasePort(ticketId);
  }

  // Test 1: Port allocation
  log("Testing port allocation...");
  const port1 = getPortForTicket("INTEG-001");
  const port2 = getPortForTicket("INTEG-002");

  if (port1 >= 14096 && port2 === port1 + 1) {
    pass(`Ports allocated correctly: ${port1}, ${port2}`);
    passed++;
  } else {
    fail(`Port allocation failed: ${port1}, ${port2}`);
    failed++;
  }

  // Test 2: Same ticket returns same port
  log("Testing port reuse...");
  const port1Again = getPortForTicket("INTEG-001");
  if (port1 === port1Again) {
    pass(`Same port returned for same ticket: ${port1Again}`);
    passed++;
  } else {
    fail(`Different port returned: expected ${port1}, got ${port1Again}`);
    failed++;
  }

  section("Command Building");

  // Test 3: buildOpenCodeCommandWithPort
  log("Testing buildOpenCodeCommandWithPort...");
  const cmd1 = buildOpenCodeCommandWithPort("CMD-001");
  if (
    cmd1.command === "opencode" &&
    cmd1.args.length === 2 &&
    cmd1.args[0] === "--port"
  ) {
    pass(`Command built correctly: ${cmd1.command} ${cmd1.args.join(" ")}`);
    passed++;
  } else {
    fail(`Invalid command: ${JSON.stringify(cmd1)}`);
    failed++;
  }

  // Test 4: buildAgentCommand with opencode
  log("Testing buildAgentCommand for opencode...");
  const cmd2 = buildAgentCommand("opencode", "CMD-002");
  if (
    cmd2.command === "opencode" &&
    cmd2.args.includes("--port")
  ) {
    pass(`buildAgentCommand works: ${cmd2.command} ${cmd2.args.join(" ")}`);
    passed++;
  } else {
    fail(`buildAgentCommand failed: ${JSON.stringify(cmd2)}`);
    failed++;
  }

  // Test 5: buildAgentCommand with claude
  log("Testing buildAgentCommand for claude...");
  const cmd3 = buildAgentCommand("claude", "CMD-003");
  if (cmd3.command === "claude" && cmd3.args.length === 0) {
    pass(`Claude command correct: ${cmd3.command}`);
    passed++;
  } else {
    fail(`Claude command wrong: ${JSON.stringify(cmd3)}`);
    failed++;
  }

  section("Health Checks (No Server)");

  // Test 6: Health check returns unhealthy when no server
  log("Testing checkOpenCodeHealth (no server)...");
  const health = await checkOpenCodeHealth("HEALTH-001");
  if (health.healthy === false && health.error !== undefined) {
    pass(`Health check correctly reports unhealthy: ${health.error.slice(0, 50)}...`);
    passed++;
  } else {
    fail(`Health check returned unexpected result: ${JSON.stringify(health)}`);
    failed++;
  }

  // Test 7: Status check returns offline when no server
  log("Testing getOpenCodeStatus (no server)...");
  const status = await getOpenCodeStatus("STATUS-001");
  if (status.type === "offline") {
    pass(`Status check correctly reports offline`);
    passed++;
  } else {
    fail(`Status check returned unexpected type: ${status.type}`);
    failed++;
  }

  section("Client Creation");

  // Test 8: Client creation with correct base URL
  log("Testing createClientForTicket...");
  const client = createClientForTicket("CLIENT-001");
  // Can't easily check internals, but it should not throw
  if (client !== null && typeof client === "object") {
    pass(`Client created successfully`);
    passed++;
  } else {
    fail(`Client creation failed`);
    failed++;
  }

  section("Cleanup");

  // Clean up ports
  releasePort("INTEG-001");
  releasePort("INTEG-002");
  releasePort("CMD-001");
  releasePort("CMD-002");
  releasePort("CMD-003");
  releasePort("HEALTH-001");
  releasePort("STATUS-001");
  releasePort("CLIENT-001");

  const remaining = getAllocatedPorts().size;
  if (remaining === 0) {
    pass(`All ports released`);
    passed++;
  } else {
    fail(`${remaining} ports still allocated`);
    failed++;
  }

  // Summary
  section("Summary");
  console.log(`\n${C.green}Passed: ${passed}${C.reset}`);
  console.log(`${C.red}Failed: ${failed}${C.reset}`);

  if (failed > 0) {
    console.log(`\n${C.red}Some tests failed!${C.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${C.green}All tests passed!${C.reset}`);
  }
}

// Run tests
runTests().catch((err) => {
  console.error(`${C.red}Test runner error:${C.reset}`, err);
  process.exit(1);
});
