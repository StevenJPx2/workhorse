/**
 * Summarization logic for agent output
 */

import { generateCompletion } from "./ollama-client.ts";
import type { AgentStep } from "./types.ts";

const SUMMARY_PROMPT = `Extract the agent's conclusion from this terminal output. What is the current status and what action was taken?

Terminal output:
{OUTPUT}

Reply with 1-2 bullet points (max 15 words each). Focus on: status, PR state, completion state, or what the agent is waiting for.`;

/**
 * Strip markdown formatting from text
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/\*([^*]+)\*/g, "$1") // *italic*
    .replace(/__([^_]+)__/g, "$1") // __bold__
    .replace(/_([^_]+)_/g, "$1") // _italic_
    .replace(/`([^`]+)`/g, "$1") // `code`
    .replace(/^#+\s*/gm, "") // # headers
    .trim();
}

/**
 * Parse the LLM response into steps
 */
function parseSteps(response: string): AgentStep[] {
  const timestamp = new Date().toISOString();
  const lines = response
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .map(stripMarkdown)
    .filter((l) => l.length > 0 && l.length < 100);

  return lines.slice(0, 3).map((description) => {
    let type: AgentStep["type"] = "action";
    const lower = description.toLowerCase();

    if (lower.includes("error") || lower.includes("fail")) {
      type = "error";
    } else if (
      lower.includes("thinking") ||
      lower.includes("analyzing") ||
      lower.includes("reading")
    ) {
      type = "thinking";
    } else if (lower.includes("complete") || lower.includes("done") || lower.includes("success")) {
      type = "result";
    }

    return { description, type, timestamp };
  });
}

/**
 * Summarize tmux output using local LLM
 */
export async function summarizeOutput(output: string, model: string): Promise<AgentStep[]> {
  if (!output.trim()) {
    return [];
  }

  // Truncate output to last ~2000 chars to keep prompt small
  const truncated = output.length > 2000 ? output.slice(-2000) : output;

  const prompt = SUMMARY_PROMPT.replace("{OUTPUT}", truncated);

  try {
    const response = await generateCompletion(model, prompt, { timeout: 60000 });
    return parseSteps(response);
  } catch {
    // Return a fallback step on error
    return [
      {
        description: "Processing...",
        type: "thinking",
        timestamp: new Date().toISOString(),
      },
    ];
  }
}
