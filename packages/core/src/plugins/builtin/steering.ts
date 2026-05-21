/**
 * Core plugin steering rules.
 *
 * Provides idle-agent reminders for memory management and workflow best practices.
 */

import type { WorkhorseContext } from "#context";

/** Tools that represent meaningful work worth remembering. */
const WORK_TOOLS = ["edit", "write", "multi_edit", "bash", "create_file"];

/** Minimum tool calls since last memory write before reminding. */
const MIN_TOOLS_SINCE_WRITE = 15;

/** Minimum work tools that must have been used to warrant a reminder. */
const MIN_WORK_TOOLS = 3;

/** Patterns that indicate git rebase/merge conflict resolution commands. */
const GIT_CONFLICT_PATTERNS = [
  /git\s+rebase\b/i,
  /git\s+merge\b/i,
  /git\s+cherry-pick\b/i,
  /git\s+checkout\s+--(?:theirs|ours)/i,
  /git\s+add\b/i, // Part of conflict resolution workflow
];

/** Time window to detect repeated conflict resolution attempts (5 minutes). */
const CONFLICT_WINDOW_MS = 5 * 60 * 1000;

/** Max conflict-related bash calls in window before escalating. */
const MAX_CONFLICT_ATTEMPTS = 8;

/**
 * Register core steering rules.
 */
export function registerCoreSteering(ctx: WorkhorseContext): void {
  ctx.orchestrator.registerSteeringRule({
    id: "core:memory-write-reminder",
    name: "Record progress to memory",
    description:
      "Remind agent to write learnings/patterns to memory after significant work",
    condition: {
      status: ["implementing", "debugging"],
      when: (steerCtx) => {
        const history = steerCtx.toolHistory;
        if (history.length < MIN_TOOLS_SINCE_WRITE) return false;

        // Find last memory write
        const lastWriteIdx = history.findLastIndex(
          (t: { name: string }) => t.name === "workhorse_memory_write",
        );

        // Tools since last write (or all if never written)
        const recentTools =
          lastWriteIdx === -1 ? history : history.slice(lastWriteIdx + 1);

        // Need enough tools since last write
        if (recentTools.length < MIN_TOOLS_SINCE_WRITE) return false;

        // Need meaningful work tools, not just reads/searches
        return (
          recentTools.filter((t: { name: string }) =>
            WORK_TOOLS.includes(t.name),
          ).length >= MIN_WORK_TOOLS
        );
      },
    },
    reminder: `You've done significant work since your last memory checkpoint. Consider recording your progress:

\`\`\`
workhorse_memory_write({
  summary: ["Brief description of what you accomplished"],
  learnings: ["Any insights or gotchas discovered"],
  patterns: ["Codebase conventions you noticed"],
  filesChanged: ["paths/to/key/files.ts"]
})
\`\`\`

This helps future sessions understand what was done and avoid repeating mistakes.`,
    priority: 5,
  });

  // Git conflict loop detection - escalate when stuck in rebase/merge conflict resolution
  ctx.orchestrator.registerSteeringRule({
    id: "core:git-conflict-loop",
    name: "Git conflict loop detection",
    description:
      "Detect and abort when stuck in repeated git rebase/merge conflict resolution",
    condition: {
      status: ["implementing", "debugging"],
      when: (steerCtx) => {
        const windowStart = Date.now() - CONFLICT_WINDOW_MS;

        // Count conflict-related bash calls within the time window
        return (
          steerCtx.toolHistory.filter(
            (t: { name: string; args: unknown; timestamp: number }) => {
              if (t.name !== "bash" || t.timestamp < windowStart) return false;
              if (typeof t.args !== "object" || t.args === null) return false;
              const args = t.args as Record<string, unknown>;
              if (typeof args.command !== "string") return false;
              return GIT_CONFLICT_PATTERNS.some((p) =>
                p.test(args.command as string),
              );
            },
          ).length >= MAX_CONFLICT_ATTEMPTS
        );
      },
    },
    reminder: `⚠️ **Git Conflict Loop Detected**

You've made ${MAX_CONFLICT_ATTEMPTS}+ attempts to resolve git conflicts in the last 5 minutes.
This usually indicates a complex merge conflict that requires manual intervention.

**Action Required:**
1. Abort the current operation: \`git rebase --abort\` or \`git merge --abort\`
2. Use \`workhorse_escalate\` to notify a human about the conflict
3. Do NOT retry the rebase/merge - wait for human guidance

The conflict likely involves binary files or complex code changes that can't be automatically resolved.`,
    priority: 100, // High priority - interrupts other reminders
    once: true, // Only fire once per issue session
  });
}
