import type { IssueStatus } from "#db";
import type { SessionEntry, SessionMemory } from "../types.ts";

/**
 * Parse a context.md file into a SessionMemory object.
 *
 * Expected format:
 * ```markdown
 * # AM-123: Title here
 *
 * ## Patterns
 * - Pattern 1
 * - Pattern 2
 *
 * ## Sessions
 *
 * ### 2025-07-15T10:30:00Z — Summary title
 * Status: implementing
 * - Did thing 1
 * - Did thing 2
 * - **Learnings:**
 *   - Learning 1
 * - **Files changed:** file1.ts, file2.ts
 * ---
 * ```
 */
export function parseSessionMemory(content: string): SessionMemory {
  const sessions = parseSessions(content);
  return {
    title: content.match(/^# (.+)$/m)?.[1]?.trim() ?? "",
    patterns: parsePatterns(content),
    sessions,
    latestStatus: sessions.at(-1)?.status ?? "pending",
  };
}

/** Extract patterns from ## Patterns section */
function parsePatterns(content: string): string[] {
  const match = content.match(/## Patterns\n([\s\S]*?)(?=\n## |$)/);
  if (!match?.[1]) return [];

  return match[1]
    .split("\n")
    .map((line) => line.match(/^- (.+)$/)?.[1]?.trim())
    .filter((p): p is string => p !== undefined);
}

/** Extract all session entries from ## Sessions section */
function parseSessions(content: string): SessionEntry[] {
  const match = content.match(/## Sessions\n([\s\S]*)$/);
  if (!match?.[1]) return [];

  return match[1]
    .split(/(?=^### \d{4}-\d{2}-\d{2}T)/m)
    .filter(Boolean)
    .map(parseSessionEntry)
    .filter((s): s is SessionEntry => s !== null);
}

/** Parse a single session entry block */
function parseSessionEntry(block: string): SessionEntry | null {
  const header = parseSessionHeader(block);
  if (!header) return null;

  const { summary, learnings, filesChanged } = parseSessionContent(block);

  return {
    ...header,
    status: parseSessionStatus(block),
    summary,
    learnings,
    filesChanged,
  };
}

/** Parse session header for timestamp */
function parseSessionHeader(block: string): { timestamp: Date } | null {
  const match = (block.split("\n")[0] ?? "").match(/^### (\d{4}-\d{2}-\d{2}T[\d:]+Z?) — .+$/);
  if (!match?.[1]) return null;
  return { timestamp: new Date(match[1]) };
}

/** Parse status line from session block */
function parseSessionStatus(block: string): IssueStatus {
  return (block.match(/^Status: (\w+)$/m)?.[1] as IssueStatus) ?? "pending";
}

/** Parse session content: summary items, learnings, and files changed */
function parseSessionContent(block: string): {
  summary: string[];
  learnings: string[];
  filesChanged: string[];
} {
  const summary: string[] = [];
  const learnings: string[] = [];
  let filesChanged: string[] = [];
  let inLearnings = false;

  for (const line of block.split("\n").slice(1)) {
    const result = processLine(line, inLearnings);
    if (result.skip) continue;

    if (result.learningsStart) {
      inLearnings = true;
    } else if (result.files) {
      inLearnings = false;
      filesChanged = result.files;
    } else if (result.learning) {
      learnings.push(result.learning);
    } else if (result.summaryItem) {
      inLearnings = false;
      summary.push(result.summaryItem);
    }
  }

  return { summary, learnings, filesChanged };
}

type LineResult = {
  skip?: boolean;
  learningsStart?: boolean;
  files?: string[];
  learning?: string;
  summaryItem?: string;
};

/** Process a single line within a session block */
function processLine(line: string, inLearnings: boolean): LineResult {
  if (!line.trim() || line.startsWith("Status:") || line === "---") {
    return { skip: true };
  }
  if (line === "- **Learnings:**") {
    return { learningsStart: true };
  }
  const filesMatch = line.match(/^- \*\*Files changed:\*\* (.+)$/);
  if (filesMatch?.[1]) {
    return { files: filesMatch[1].split(",").map((f) => f.trim()) };
  }
  if (inLearnings && line.match(/^\s+- /)) {
    return { learning: line.replace(/^\s+- /, "").trim() };
  }
  if (line.match(/^- /)) {
    return { summaryItem: line.replace(/^- /, "").trim() };
  }
  return { skip: true };
}
