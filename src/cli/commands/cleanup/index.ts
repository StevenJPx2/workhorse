/**
 * Cleanup command - Remove stale worktrees and test artifacts
 *
 * Usage:
 *   jiratown cleanup              # Interactive cleanup
 *   jiratown cleanup --all        # Remove all worktrees without prompting
 *   jiratown cleanup --dry-run    # Show what would be removed
 */

import { defineCommand } from "citty";

export default defineCommand({
  meta: {
    name: "cleanup",
    description: "Remove stale worktrees and test artifacts",
  },
  args: {
    all: {
      type: "boolean",
      description: "Remove all worktrees without prompting",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be removed without actually removing",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Force removal even if worktree has uncommitted changes",
      default: false,
    },
  },
  async run({ args }) {
    const { runCleanup } = await import("./run.ts");
    await runCleanup({
      all: args.all,
      dryRun: args["dry-run"],
      force: args.force,
    });
  },
});
