/**
 * TUI Integration Tests
 *
 * Uses the headless terminal harness to test the TUI renders correctly.
 * Run with: bun test/tui.test.ts
 */

import { runTests, printResults, type TestCase } from "./harness";

const tests: TestCase[] = [
  // Basic rendering tests
  {
    name: "renders JIRATOWN header",
    assert: (text) => text.includes("JIRATOWN") || "Missing 'JIRATOWN' header",
  },
  {
    name: "renders ISSUES section",
    assert: (text) => text.includes("ISSUES") || "Missing 'ISSUES' section heading",
  },
  {
    name: "renders AGENTS section",
    assert: (text) => text.includes("AGENTS") || "Missing 'AGENTS' section heading",
  },
  {
    name: "renders status bar with quit hint",
    assert: (text) => text.toLowerCase().includes("quit") || "Missing 'quit' hint in status bar",
  },
  {
    name: "renders chat input placeholder",
    assert: (text) =>
      text.includes("Type a task") ||
      text.includes("issue key") ||
      "Missing chat input placeholder",
  },

  // Layout tests — open spawn modal to get borders
  {
    name: "has proper box borders in modal",
    keys: ["<CR>"],
    assert: (text) =>
      (text.includes("╭") && text.includes("╰") && text.includes("╮") && text.includes("╯")) ||
      "Missing box border characters in modal",
  },

  // No crash tests
  {
    name: "does not show fatal error",
    assert: (text) =>
      !text.includes("TypeError") && !text.includes("ReferenceError")
        ? true
        : "Found JavaScript error in output",
  },
];

console.log("Running TUI integration tests...\n");
console.log("Note: Each test starts a fresh TUI instance, so this may take a while.\n");

const results = await runTests(tests, {
  cwd: process.cwd(),
  renderWaitMs: 5000,
  timeoutSec: 15,
});

printResults(results);

// Exit with error code if any tests failed
process.exit(results.filter((r) => !r.passed).length > 0 ? 1 : 0);
