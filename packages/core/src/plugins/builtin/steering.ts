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

/**
 * Register core steering rules.
 */
export function registerCoreSteering(ctx: WorkhorseContext): void {
  ctx.orchestrator.registerSteeringRule({
    id: "core:memory-write-reminder",
    name: "Record progress to memory",
    description: "Remind agent to write learnings/patterns to memory after significant work",
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
        const recentTools = lastWriteIdx === -1 ? history : history.slice(lastWriteIdx + 1);

        // Need enough tools since last write
        if (recentTools.length < MIN_TOOLS_SINCE_WRITE) return false;

        // Need meaningful work tools, not just reads/searches
        return (
          recentTools.filter((t: { name: string }) => WORK_TOOLS.includes(t.name)).length >=
          MIN_WORK_TOOLS
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
}
