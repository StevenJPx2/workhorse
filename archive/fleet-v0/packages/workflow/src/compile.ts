// Prompt assembly for one AgentDefinition invocation.

import type { AgentDefinition } from "@workhorse/api";
import { agentEpilogue, type AgentSession } from "./agent-session";

const RUN_ROOT = "/workspace/.workflow";

function runDir(runId: string): string {
  return `${RUN_ROOT}/${runId}`;
}

export function stageDir(runId: string, stageId: string, round: number): string {
  return `${runDir(runId)}/stages/${stageId}/round-${round}`;
}

/** Digest of a completed agent, injected into downstream agents. */
export function upstreamDigest(
  stageId: string,
  analysis: string | null,
  control: Record<string, unknown> | undefined,
  maxChars: number,
): string {
  const parts = [`### Upstream stage \`${stageId}\``];
  if (control && Object.keys(control).length) parts.push("Control: " + JSON.stringify(control));
  if (analysis?.trim()) {
    const text = analysis.trim();
    parts.push(text.length > maxChars ? `${text.slice(0, maxChars)}\n…(truncated)` : text);
  }
  return parts.join("\n\n");
}

export interface AgentPromptParts {
  task: string;
  inputs?: Record<string, string | number | boolean>;
  input?: Record<string, unknown>;
  upstream: string[];
  steer?: string;
  routedFrom?: { stage: string; digest: string };
  notifications?: string;
  round: number;
}

/**
 * Assemble the user prompt for an AgentDefinition.
 *
 * The agent's instructions become the system persona. This prompt carries only
 * run-specific data and the schema-derived completion contract.
 */
export function assembleAgentPrompt(
  agent: AgentDefinition,
  session: AgentSession,
  dir: string,
  parts: AgentPromptParts,
): string {
  const sections: string[] = [`# Task\n\n${parts.task}`];
  if (parts.inputs && Object.keys(parts.inputs).length) {
    sections.push(
      "## Inputs\n\n" +
        Object.entries(parts.inputs)
          .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
          .join("\n"),
    );
  }
  if (parts.input && Object.keys(parts.input).length) {
    sections.push(
      "## Invocation input\n\n" +
        Object.entries(parts.input)
          .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
          .join("\n"),
    );
  }
  if (parts.upstream.length) sections.push(`## Upstream artifacts\n\n${parts.upstream.join("\n\n")}`);
  sections.push(`## Your stage: ${agent.name}\n\nFollow the system instructions for this stage.`);
  if (parts.round > 1) sections.push(`## Stage round ${parts.round}`);
  if (parts.steer) {
    sections.push(
      "## Operator steering (read carefully)\n\n" +
        "A human operator redirected this stage. Their instructions take precedence " +
        `over conflicting parts of the task above:\n\n${parts.steer}`,
    );
  }
  if (parts.routedFrom) {
    sections.push(
      `## Routed back from \`${parts.routedFrom.stage}\` (address these findings)\n\n` +
        "A downstream stage evaluated your previous work and routed the workflow back to " +
        `this stage. Fix EVERY blocking finding below:\n\n${parts.routedFrom.digest}`,
    );
  }
  if (parts.notifications) sections.push(parts.notifications);
  sections.push(agentEpilogue(session, dir));
  return sections.join("\n\n---\n\n");
}
