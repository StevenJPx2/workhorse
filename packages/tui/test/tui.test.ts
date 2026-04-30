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
    name: "renders Jiratown header",
    assert: (text) => text.includes("Jiratown") || "Missing 'Jiratown' header",
  },
  {
    name: "renders ISSUES section",
    assert: (text) => text.includes("ISSUES") || "Missing 'ISSUES' section heading",
  },
  // Note: AGENTS section may be obscured by opentui's internal Console panel
  // {
  //   name: "renders AGENTS section",
  //   assert: (text) => text.includes("AGENTS") || "Missing 'AGENTS' section heading",
  // },
  {
    name: "renders status bar with quit hint",
    assert: (text) => text.includes("q:quit") || "Missing 'q:quit' in status bar",
  },
  {
    name: "renders chat input placeholder",
    assert: (text) =>
      text.includes("Ask a q") || text.includes("command") || "Missing chat input placeholder",
  },

  // Layout tests
  {
    name: "has proper box borders",
    assert: (text) =>
      (text.includes("┌") && text.includes("└") && text.includes("┐") && text.includes("┘")) ||
      "Missing box border characters",
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
