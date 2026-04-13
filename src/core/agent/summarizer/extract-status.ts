/**
 * Extract status info from agent message text
 *
 * Returns meaningful summaries from agent output, showing actual reasons
 * for blocked/error states rather than generic messages.
 */

import type { AgentStep } from "./types.ts";

/**
 * Clean markdown formatting from text
 */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "") // Remove bold
    .replace(/\*/g, "") // Remove italic
    .replace(/`/g, "") // Remove code
    .replace(/^#+\s*/gm, "") // Remove headers
    .replace(/^\s*[-*]\s*/gm, "") // Remove list markers
    .trim();
}

/**
 * Extract the reason/issue from a blocked or error message
 * Looks for patterns like "Issue:", "Reason:", "Problem:", "Error:"
 */
function extractReason(text: string): string | null {
  // Look for explicit issue/reason markers
  const patterns = [
    /\*\*Issue:\*\*\s*(.+?)(?:\n\n|\*\*|$)/is,
    /\*\*Reason:\*\*\s*(.+?)(?:\n\n|\*\*|$)/is,
    /\*\*Problem:\*\*\s*(.+?)(?:\n\n|\*\*|$)/is,
    /\*\*Error:\*\*\s*(.+?)(?:\n\n|\*\*|$)/is,
    /Issue:\s*(.+?)(?:\n\n|$)/is,
    /Reason:\s*(.+?)(?:\n\n|$)/is,
    /Problem:\s*(.+?)(?:\n\n|$)/is,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanMarkdown(match[1].trim());
    }
  }

  return null;
}

/**
 * Detect the type of message based on content
 */
function detectType(text: string): AgentStep["type"] {
  const lower = text.toLowerCase();

  if (lower.includes("blocked") || lower.includes("error") || lower.includes("failed")) {
    return "error";
  }
  if (lower.includes("complete") || lower.includes("done") || lower.includes("finished")) {
    return "result";
  }
  if (lower.includes("would you like") || lower.includes("waiting") || lower.includes("?")) {
    return "thinking";
  }
  return "action";
}

/**
 * Get the first meaningful paragraph as a fallback
 */
function getFirstMeaningfulContent(text: string): string {
  const cleaned = cleanMarkdown(text);
  // Get first paragraph (up to double newline or end)
  const firstPara = cleaned.split(/\n\n/)[0] || cleaned;
  // If still too long, get first few sentences
  const sentences = firstPara.split(/(?<=[.!?])\s+/);
  if (sentences.length > 3) {
    return sentences.slice(0, 3).join(" ");
  }
  return firstPara;
}

/**
 * Extract key status info from agent message
 *
 * For blocked/error states, extracts the actual reason.
 * For other states, shows the first meaningful content.
 *
 * No truncation is done here - the UI handles display limits.
 */
export function extractStatusFromMessage(text: string): AgentStep[] {
  const timestamp = new Date().toISOString();

  if (!text || text.trim().length === 0) {
    return [];
  }

  const type = detectType(text);
  const steps: AgentStep[] = [];

  // For error/blocked states, try to extract the reason
  if (type === "error") {
    const reason = extractReason(text);
    if (reason) {
      steps.push({
        description: reason,
        type: "error",
        timestamp,
      });
      return steps;
    }
  }

  // Fallback: show first meaningful content
  const content = getFirstMeaningfulContent(text);
  steps.push({
    description: content,
    type,
    timestamp,
  });

  return steps;
}
