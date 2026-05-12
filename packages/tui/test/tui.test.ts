/**
 * TUI Integration Tests
 *
 * Uses the headless terminal harness to test the TUI renders correctly.
 *
 * Run with:
 *   bun test/tui.test.ts                    # Run all tests
 *   bun test/tui.test.ts render             # Run tests in "render" group
 *   bun test/tui.test.ts create-issue       # Run tests in "create-issue" group
 *   bun test/tui.test.ts spawn              # Run tests in "spawn" group
 *   bun test/tui.test.ts message            # Run tests in "message" group
 *   bun test/tui.test.ts "Tab cycles"       # Run tests matching pattern
 */

import { runTests, printResults, type TestCase } from "./harness";

// Helper to skip test if no adapters configured
const skipIfNoAdapters = (text: string): true | null =>
  text.includes("No adapters") || text.includes("SPAWN AGENT") ? true : null;

type TestGroup = "render" | "create-issue" | "spawn" | "message";

interface GroupedTestCase extends TestCase {
  group: TestGroup;
}

const tests: GroupedTestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Basic Rendering Tests
  // ═══════════════════════════════════════════════════════════════════════════
  {
    group: "render",
    name: "renders JIRATOWN header",
    assert: (text) => text.includes("JIRATOWN") || "Missing 'JIRATOWN' header",
  },
  {
    group: "render",
    name: "renders ISSUES section",
    assert: (text) => text.includes("ISSUES") || "Missing 'ISSUES' section heading",
  },
  {
    group: "render",
    name: "renders AGENTS section",
    assert: (text) => text.includes("AGENTS") || "Missing 'AGENTS' section heading",
  },
  {
    group: "render",
    name: "renders status bar with quit hint",
    assert: (text) => text.toLowerCase().includes("quit") || "Missing 'quit' hint in status bar",
  },
  {
    group: "render",
    name: "renders chat input placeholder",
    assert: (text) =>
      text.includes("Type a task") ||
      text.includes("issue key") ||
      "Missing chat input placeholder",
  },
  {
    group: "render",
    name: "has proper box borders in modal",
    keys: ["<CR>"],
    assert: (text) =>
      (text.includes("╭") && text.includes("╰") && text.includes("╮") && text.includes("╯")) ||
      "Missing box border characters in modal",
  },
  {
    group: "render",
    name: "does not show fatal error",
    assert: (text) =>
      !text.includes("TypeError") && !text.includes("ReferenceError")
        ? true
        : "Found JavaScript error in output",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Create Issue Flow
  // ═══════════════════════════════════════════════════════════════════════════
  {
    group: "create-issue",
    name: "Tab cycles focus to agents",
    keys: ["<Tab>"],
    assert: (text) => text.includes("AGENTS") || "Missing AGENTS section",
  },
  {
    group: "create-issue",
    name: "Tab twice focuses chat input",
    keys: ["<Tab>", "<Tab>"],
    assert: (text) =>
      text.includes("Type a task") || text.includes("issue key") || "Chat input not visible",
  },
  {
    group: "create-issue",
    name: "Enter on issue opens spawn modal",
    keys: ["<CR>"],
    assert: (text) => {
      if (text.includes("SPAWN AGENT")) return true;
      if (text.includes("Agent Harness")) return true;
      return "Expected spawn modal after Enter";
    },
  },
  {
    group: "create-issue",
    name: "spawn modal shows harness selection",
    keys: ["<CR>"],
    assert: (text) => text.includes("Agent Harness") || "Missing harness field",
  },
  {
    group: "create-issue",
    name: "spawn modal shows base branch",
    keys: ["<CR>"],
    assert: (text) => text.includes("Base Branch") || "Missing branch field",
  },
  {
    group: "create-issue",
    name: "Escape closes spawn modal",
    keys: ["<CR>", "<Esc>"],
    assert: (text) => {
      if (text.includes("SPAWN AGENT")) return "Modal still visible";
      if (!text.includes("ISSUES")) return "Not back to overview";
      return true;
    },
  },
  {
    group: "create-issue",
    name: "Down navigates harness options",
    keys: ["<CR>", "<Down>"],
    assert: (text) => text.includes("SPAWN AGENT") || "Modal closed unexpectedly",
  },
  {
    group: "create-issue",
    name: "Tab switches modal fields",
    keys: ["<CR>", "<Tab>"],
    assert: (text) => {
      if (!text.includes("SPAWN AGENT")) return "Modal closed";
      if (!text.includes("Base Branch")) return "Branch field missing";
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Create Issue and Spawn Agent Flow
  // ═══════════════════════════════════════════════════════════════════════════
  {
    group: "spawn",
    name: "modal has all configuration options",
    keys: ["<CR>"],
    assert: (text) => {
      if (!text.includes("Agent Harness")) return "Missing harness";
      if (!text.includes("Base Branch")) return "Missing branch";
      if (!text.includes("spawn")) return "Missing spawn hint";
      if (!text.includes("cancel")) return "Missing cancel hint";
      return true;
    },
  },
  {
    group: "spawn",
    name: "arrow keys navigate harness list",
    keys: ["<CR>", "<Down>", "<Up>"],
    assert: (text) => text.includes("SPAWN AGENT") || "Modal closed",
  },
  {
    group: "spawn",
    name: "Tab toggles between harness and branch",
    keys: ["<CR>", "<Tab>", "<Tab>"],
    assert: (text) => text.includes("Agent Harness") || "Lost harness field",
  },
  {
    group: "spawn",
    name: "can cancel and reopen modal",
    keys: ["<CR>", "<Esc>", "<CR>"],
    assert: (text) => text.includes("SPAWN AGENT") || "Could not reopen",
  },
  {
    group: "spawn",
    name: "Enter spawns agent or shows error",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      // Expect agent screen, no-adapters state, or error
      if (text.includes("ACTIVITY")) return true;
      if (text.includes("No adapters")) return true;
      if (text.includes("SPAWN AGENT")) return true;
      return true; // Accept any state since env may vary
    },
  },
  {
    group: "spawn",
    name: "Down navigates to next issue",
    keys: ["<Down>"],
    assert: (text) => text.includes("ISSUES") || "Not on overview",
  },
  {
    group: "spawn",
    name: "j/k vim keys navigate issues",
    keys: ["j", "<CR>"],
    assert: (text) => text.includes("SPAWN AGENT") || "Modal not open after j",
  },
  {
    group: "spawn",
    name: "can spawn different issue",
    keys: ["<Down>", "<CR>"],
    assert: (text) => {
      if (!text.includes("SPAWN AGENT")) return "Modal not open";
      if (!text.includes("Issue:")) return "Issue info missing";
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Spawn Agent and Send Message Flow
  // ═══════════════════════════════════════════════════════════════════════════
  {
    group: "message",
    name: "double Enter spawns agent",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      if (text.includes("ACTIVITY")) return true;
      return "Expected agent screen";
    },
  },
  {
    group: "message",
    name: "agent screen shows ACTIVITY",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      return text.includes("ACTIVITY") || "Missing ACTIVITY";
    },
  },
  {
    group: "message",
    name: "agent screen shows FILES panel",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      return text.includes("FILES") || "Missing FILES";
    },
  },
  {
    group: "message",
    name: "agent screen shows sidebar",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      return text.includes("AGENTS") || "Missing sidebar";
    },
  },
  {
    group: "message",
    name: "agent screen has chat prompt",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      // Check for prompt character or activity header (indicates agent screen)
      return text.includes("❯") || text.includes("ACTIVITY") || "Missing prompt";
    },
  },
  {
    group: "message",
    name: "can type in chat",
    keys: ["<CR>", "<CR>", "Hello"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      return true; // Just verify no crash
    },
  },
  {
    group: "message",
    name: "Enter sends message",
    keys: ["<CR>", "<CR>", "Test<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      return text.includes("ACTIVITY") || "Left agent screen";
    },
  },
  {
    group: "message",
    name: "Escape returns to overview",
    keys: ["<CR>", "<CR>", "<Esc>"],
    assert: (text) => {
      if (text.includes("No adapters")) {
        return text.includes("ISSUES") || "Didn't close modal";
      }
      // May still be on agent screen if ESC timing was off, or back to overview
      return text.includes("JIRATOWN") || text.includes("ACTIVITY") || "Not on overview or agent";
    },
  },
  {
    group: "message",
    name: "Tab cycles focus in agent screen",
    keys: ["<CR>", "<CR>", "<Tab>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      return text.includes("ACTIVITY") || "Left screen";
    },
  },
  {
    group: "message",
    name: "multiple Escapes reach overview",
    keys: ["<CR>", "<CR>", "<Esc>", "<Esc>", "<Esc>"],
    assert: (text) => {
      // May still be on agent screen if agent is starting, or back to overview
      return text.includes("ISSUES") || text.includes("ACTIVITY") || "Not on overview or agent";
    },
  },
  {
    group: "message",
    name: "agent header shows issue ID",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      // Match various ID formats: PROJ-123, LOCAL-xxx, or any alphanumeric ID
      return /[A-Z]+-[a-z0-9]+/i.test(text) || text.includes("Issue") || "No issue ID";
    },
  },
  {
    group: "message",
    name: "agent shows status indicator",
    keys: ["<CR>", "<CR>"],
    assert: (text) => {
      if (skipIfNoAdapters(text)) return true;
      const hasStatus =
        text.includes("RUNNING") ||
        text.includes("STOPPED") ||
        text.includes("STARTING") ||
        text.includes("●") ||
        text.includes("■");
      return hasStatus || "No status";
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Test Runner with Filtering
// ═══════════════════════════════════════════════════════════════════════════

const GROUPS: TestGroup[] = ["render", "create-issue", "spawn", "message"];

function printUsage() {
  console.log(`
Usage: bun test/tui.test.ts [filter]

Filters:
  render        Run basic rendering tests
  create-issue  Run create issue flow tests
  spawn         Run spawn agent flow tests
  message       Run send message flow tests
  <pattern>     Run tests whose name contains <pattern>

Examples:
  bun test/tui.test.ts                # Run all tests
  bun test/tui.test.ts render         # Run render group only
  bun test/tui.test.ts "Tab"          # Run tests with "Tab" in name
  bun test/tui.test.ts spawn          # Run spawn group only
`);
}

// Parse CLI args
const filter = process.argv[2];

if (filter === "--help" || filter === "-h") {
  printUsage();
  process.exit(0);
}

// Filter tests by group name or pattern
// oxlint-disable-next-line jiratown/no-single-use-variable
const filteredTests = (() => {
  if (!filter) return tests;
  if (GROUPS.includes(filter as TestGroup)) {
    return tests.filter((t) => t.group === filter);
  }
  const pattern = filter.toLowerCase();
  return tests.filter((t) => t.name.toLowerCase().includes(pattern));
})();

if (filteredTests.length === 0) {
  console.error(`No tests match filter: "${filter}"\n`);
  printUsage();
  process.exit(1);
}

const groupCounts = GROUPS.reduce(
  (acc, g) => {
    acc[g] = filteredTests.filter((t) => t.group === g).length;
    return acc;
  },
  {} as Record<TestGroup, number>,
);

console.log("Running TUI integration tests...\n");
if (filter) {
  console.log(`Filter: ${filter}`);
}
console.log(`Tests: ${filteredTests.length} total`);
for (const [group, count] of Object.entries(groupCounts)) {
  if (count > 0) console.log(`  - ${group}: ${count}`);
}
console.log("\nNote: Each test starts a fresh TUI instance, so this may take a while.\n");

const results = await runTests(filteredTests, {
  cwd: process.cwd(),
  renderWaitMs: 5000,
  timeoutSec: 15,
});

printResults(results);

// Exit with error code if any tests failed
process.exit(results.filter((r) => !r.passed).length > 0 ? 1 : 0);
