import type { Issue } from "#db";
import type { SearchResult, SessionMemory } from "#services/memory";
import type { OrchestratorTool } from "#workflow/orchestrator";

import type { PromptContextBlock } from "./types.ts";

/**
 * Render the issue information section.
 */
export function renderIssueSection(issue: Issue): string {
  const lines: string[] = [`## Issue: ${issue.externalId}`];

  lines.push(`**Title**: ${issue.title}`);
  lines.push(`**Type**: ${issue.issueType}`);
  lines.push(`**Status**: ${issue.status}`);

  if (issue.url) {
    lines.push(`**URL**: ${issue.url}`);
  }

  if (issue.assignee) {
    lines.push(`**Assignee**: ${issue.assignee}`);
  }

  if (issue.labels && issue.labels.length > 0) {
    lines.push(`**Labels**: ${issue.labels.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Render a context block.
 */
export function renderContextBlock(block: PromptContextBlock): string {
  return `## ${block.title}\n\n${block.content}`;
}

/**
 * Render L2 search results.
 */
export function renderSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "";

  return `## Related Context\n\n${results
    .filter((r) => r.content)
    .map(
      (r) =>
        `### ${(r.metadata ?? {}).type ?? "context"} (score: ${r.score.toFixed(2)})\n\n${r.content}`,
    )
    .join("\n\n")}`;
}

/**
 * Sort context blocks by priority (lower = earlier).
 */
export function sortContextBlocks(blocks: PromptContextBlock[]): PromptContextBlock[] {
  return [...blocks].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

/**
 * Build the initial prompt for a new session.
 */
export function buildInitialPrompt(issue: Issue): string {
  return `## Task

You are starting work on issue **${issue.externalId}**: ${issue.title}

${issue.description || "No description provided."}

Please analyze the requirements and begin implementation.`;
}

/**
 * Render tools section for system prompt.
 */
export function renderToolsSection(tools: OrchestratorTool[]): string {
  const lines = ["## Workhorse Tools", "", "The following tools are available:", ""];
  for (const tool of tools) lines.push(`### ${tool.name}`, tool.description, "");
  return lines.join("\n");
}

/**
 * Build the resume prompt for continuing work.
 */
export function buildResumePrompt(issue: Issue, sessionMemory?: SessionMemory): string {
  const parts: string[] = [];

  parts.push(`## Resuming Work

You are resuming work on issue **${issue.externalId}**: ${issue.title}

Current status: **${issue.status}**`);

  // Include session memory summary if available
  if (sessionMemory) {
    const { sessions, patterns } = sessionMemory;

    if (patterns.length > 0) {
      parts.push(`### Codebase Patterns\n\n${patterns.map((p) => `- ${p}`).join("\n")}`);
    }

    const lastSession = sessions.at(-1);
    if (lastSession) {
      parts.push(`### Last Session

**Date**: ${lastSession.timestamp.toISOString()}
**Status**: ${lastSession.status}

**Summary**:
${lastSession.summary.map((s) => `- ${s}`).join("\n")}

${lastSession.learnings.length > 0 ? `**Learnings**:\n${lastSession.learnings.map((l) => `- ${l}`).join("\n")}` : ""}

${lastSession.filesChanged.length > 0 ? `**Files Changed**:\n${lastSession.filesChanged.map((f) => `- ${f}`).join("\n")}` : ""}`);
    }
  }

  parts.push(`Please continue where you left off.`);

  return parts.join("\n\n");
}
