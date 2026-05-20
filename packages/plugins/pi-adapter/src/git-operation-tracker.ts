/**
 * Git operation timeout tracking.
 *
 * Tracks multi-step git operations (rebase, merge, cherry-pick) and enforces
 * a hard timeout to prevent agents from getting stuck in conflict resolution loops.
 *
 * @module workhorse-plugin-pi-adapter/git-operation-tracker
 */

/** Patterns that start a new git operation that can have conflicts. */
const GIT_START_PATTERNS = [/git\s+rebase\b/i, /git\s+merge\b/i, /git\s+cherry-pick\b/i];

/** Patterns indicating we're still in an ongoing operation (conflict resolution). */
const GIT_CONTINUE_PATTERNS = [
  /--continue\b/i,
  /--skip\b/i,
  /--theirs\b/i,
  /--ours\b/i,
  /git\s+add\b/i, // Mark conflicts as resolved
];

/** Default timeout for git operations (3 minutes). */
const DEFAULT_GIT_OP_TIMEOUT_MS = 3 * 60 * 1000;

interface GitOperation {
  type: "rebase" | "merge" | "cherry-pick";
  startTime: number;
  commandCount: number;
}

/**
 * Tracks ongoing git operations and enforces timeouts.
 *
 * @example
 * ```typescript
 * const tracker = new GitOperationTracker();
 *
 * // Before executing a bash command:
 * const error = tracker.checkCommand(command);
 * if (error) {
 *   return { success: false, error };
 * }
 * // Execute the command...
 * ```
 */
export class GitOperationTracker {
  private operation: GitOperation | null = null;
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = DEFAULT_GIT_OP_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Check a command before execution.
   * Returns an error message if the operation has timed out, otherwise null.
   */
  checkCommand(command: string): string | null {
    const now = Date.now();

    // Abort always clears operation immediately (check first, before timeout)
    if (this.operation && /--abort\b/.test(command)) {
      this.operation = null;
      return null;
    }

    const isContinue = this.isContinueCommand(command);

    // Check if this is part of an ongoing operation (must check BEFORE start)
    // "git rebase --continue" contains "rebase" but is a continue, not a new start
    if (this.operation && isContinue) {
      this.operation.commandCount++;

      // Check timeout
      const elapsed = now - this.operation.startTime;
      if (elapsed > this.timeoutMs) {
        const type = this.operation.type;
        const minutes = Math.round(elapsed / 60000);
        const cmds = this.operation.commandCount;

        // Clear the operation so subsequent commands don't keep hitting timeout
        this.operation = null;

        return (
          `⏱️ Git ${type} operation timed out after ${minutes} minutes and ${cmds} commands.\n\n` +
          `The operation is taking too long, likely due to complex conflicts.\n\n` +
          `**Required Actions:**\n` +
          `1. Abort the operation: \`git ${type} --abort\`\n` +
          `2. Use \`workhorse_escalate\` to notify a human about the conflict\n` +
          `3. Do NOT retry - wait for human guidance\n\n` +
          `Hint: This often happens with binary files (images, etc.) that can't be auto-merged.`
        );
      }
      return null;
    }

    // Check if this starts a new operation (only if not a continue command)
    if (!isContinue && this.isStartCommand(command)) {
      this.operation = {
        type: this.getOperationType(command),
        startTime: now,
        commandCount: 1,
      };
    }

    return null;
  }

  /** Reset the tracker (e.g., when agent stops). */
  reset(): void {
    this.operation = null;
  }

  private isStartCommand(command: string): boolean {
    return GIT_START_PATTERNS.some((p) => p.test(command));
  }

  private isContinueCommand(command: string): boolean {
    return GIT_CONTINUE_PATTERNS.some((p) => p.test(command));
  }

  private getOperationType(command: string): "rebase" | "merge" | "cherry-pick" {
    if (/rebase/i.test(command)) return "rebase";
    if (/merge/i.test(command)) return "merge";
    return "cherry-pick";
  }
}
