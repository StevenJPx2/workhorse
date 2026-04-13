#!/usr/bin/env bun
/**
 * Jiratown CLI - Terminal UI dashboard for orchestrating AI coding agents on Jira tickets
 *
 * Usage:
 *   jiratown                    # Launch TUI dashboard (context-aware to current repo)
 *   jiratown --all              # Launch TUI with all tickets across all repos
 *   jiratown setup              # First-time setup
 *   jiratown add <ticket>       # Quick add a ticket
 *   jiratown cleanup            # Remove stale worktrees (interactive)
 *   jiratown cleanup --all      # Remove all worktrees without prompting
 *   jiratown cleanup --dry-run  # Show what would be removed
 */

import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "jiratown",
    version: "0.1.0",
    description: "Terminal UI dashboard for orchestrating AI coding agents on Jira tickets",
  },
  args: {
    all: {
      type: "boolean",
      description: "Show all tickets across all repositories",
      default: false,
    },
  },
  subCommands: {
    setup: () => import("./commands/setup/index.ts").then((m) => m.default),
    add: () => import("./commands/add/index.ts").then((m) => m.default),
    cleanup: () => import("./commands/cleanup/index.ts").then((m) => m.default),
  },
  async run({ args }) {
    // If no subcommand, launch the dashboard
    const { runDashboard } = await import("./commands/dashboard/index.ts");
    await runDashboard({ all: args.all });
  },
});

runMain(main);
