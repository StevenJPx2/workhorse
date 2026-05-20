/**
 * Utility functions for building indexable documents from session memory.
 *
 * @module services/memory/indexer/utils
 */

import type { MemoryDocument, MemoryDocumentType, SessionMemory } from "../types.ts";

/** Document ID prefix for session memory documents */
const SESSION_DOC_PREFIX = "session:";

/**
 * Build L2 documents from session memory.
 */
export function buildSessionDocuments(
  externalId: string,
  internalId: string,
  memory: SessionMemory,
): MemoryDocument[] {
  const documents: MemoryDocument[] = [];
  const timestamp = Date.now();

  // Index the overall session summary
  const summaryContent = buildSessionSummaryContent(memory);
  if (summaryContent) {
    documents.push({
      id: `${SESSION_DOC_PREFIX}${externalId}:summary:${timestamp}`,
      content: summaryContent,
      metadata: {
        type: "session_memory" as MemoryDocumentType,
        source: "agent",
        issueId: internalId,
        externalId,
        title: memory.title,
        status: memory.latestStatus,
      },
    });
  }

  // Index patterns as a separate document (reusable across issues)
  if (memory.patterns.length > 0) {
    documents.push({
      id: `${SESSION_DOC_PREFIX}${externalId}:patterns:${timestamp}`,
      content: `Codebase patterns discovered while working on ${memory.title}:\n\n${memory.patterns.map((p) => `- ${p}`).join("\n")}`,
      metadata: {
        type: "code_context" as MemoryDocumentType,
        source: "agent",
        issueId: internalId,
        externalId,
      },
    });
  }

  // Index significant learnings from sessions
  const learnings = memory.sessions.flatMap((s) => s.learnings).filter((l) => l.length > 0);

  if (learnings.length > 0) {
    documents.push({
      id: `${SESSION_DOC_PREFIX}${externalId}:learnings:${timestamp}`,
      content: `Learnings from ${memory.title}:\n\n${learnings.map((l) => `- ${l}`).join("\n")}`,
      metadata: {
        type: "decision" as MemoryDocumentType,
        source: "agent",
        issueId: internalId,
        externalId,
      },
    });
  }

  return documents;
}

/**
 * Build a summary of the session memory for indexing.
 */
export function buildSessionSummaryContent(memory: SessionMemory): string {
  const parts: string[] = [`# ${memory.title}`, "", `Status: ${memory.latestStatus}`, ""];

  // Add session summaries
  for (const session of memory.sessions) {
    const summaryText = session.summary.filter((s) => s !== "Session initialized").join("; ");
    if (summaryText) {
      parts.push(`- ${summaryText}`);
    }
  }

  // Add files changed
  const filesChanged = [...new Set(memory.sessions.flatMap((s) => s.filesChanged))];
  if (filesChanged.length > 0) {
    parts.push("", "Files modified:", ...filesChanged.map((f) => `- ${f}`));
  }

  return parts.join("\n").trim();
}
