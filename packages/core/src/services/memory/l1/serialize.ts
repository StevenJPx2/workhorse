import type { SessionEntry, SessionMemory } from "../types.ts";

/**
 * Serialize a SessionMemory object back to markdown format.
 */
export function serializeSessionMemory(memory: SessionMemory): string {
  const lines: string[] = [];

  lines.push(`# ${memory.title}`);
  lines.push("");

  lines.push("## Patterns");
  if (memory.patterns.length === 0) {
    lines.push("");
  } else {
    for (const pattern of memory.patterns) {
      lines.push(`- ${pattern}`);
    }
  }
  lines.push("");

  lines.push("## Sessions");
  lines.push("");

  for (const session of memory.sessions) {
    lines.push(serializeSessionEntry(session));
  }

  return lines.join("\n");
}

/** Serialize a single session entry to markdown */
function serializeSessionEntry(entry: SessionEntry): string {
  const lines: string[] = [];

  lines.push(
    `### ${entry.timestamp.toISOString().replace(/\.\d{3}Z$/, "Z")} — ${entry.summary[0] ?? "Work session"}`,
  );
  lines.push(`Status: ${entry.status}`);

  for (const item of entry.summary.slice(1)) {
    lines.push(`- ${item}`);
  }

  if (entry.learnings.length > 0) {
    lines.push("- **Learnings:**");
    for (const learning of entry.learnings) {
      lines.push(`  - ${learning}`);
    }
  }

  if (entry.filesChanged.length > 0) {
    lines.push(`- **Files changed:** ${entry.filesChanged.join(", ")}`);
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
