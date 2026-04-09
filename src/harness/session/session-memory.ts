/**
 * Session Memory - Persists agent context to worktree for resumption
 *
 * Stores session context in `.jiratown/context.md` in each ticket's worktree.
 * This allows agents to be resumed with full context of their previous work.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { type SessionEvent, type SessionMemory, CONTEXT_FILE, MAX_EVENTS } from "./session-types.ts";
import { ensureJiratownDir, parseFrontmatter, parseRecentActivity, parseKeyDecisions } from "./session-parser.ts";

export type { SessionEvent, SessionMemory } from "./session-types.ts";

export function getContextPath(worktreePath: string): string {
  return join(worktreePath, ".jiratown", CONTEXT_FILE);
}

export function readSessionMemory(worktreePath: string): SessionMemory | null {
  const contextPath = getContextPath(worktreePath);

  if (!existsSync(contextPath)) {
    return null;
  }

  try {
    const content = readFileSync(contextPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    const summaryMatch = body.match(/## Session Summary\n([\s\S]*?)(?=\n## |$)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : "";

    return {
      ticketId: frontmatter.ticket_id || "",
      status: frontmatter.status || "pending",
      agent: frontmatter.agent || "opencode",
      branch: frontmatter.branch || "",
      startedAt: frontmatter.started_at || new Date().toISOString(),
      lastUpdatedAt: frontmatter.last_updated || new Date().toISOString(),
      summary,
      recentActivity: parseRecentActivity(body),
      keyDecisions: parseKeyDecisions(body),
    };
  } catch (error) {
    console.error(`Failed to read session memory: ${error}`);
    return null;
  }
}

export function writeSessionMemory(worktreePath: string, memory: SessionMemory): boolean {
  try {
    ensureJiratownDir(worktreePath);
    const contextPath = getContextPath(worktreePath);

    const content = formatSessionMemory(memory);
    writeFileSync(contextPath, content, "utf-8");
    return true;
  } catch (error) {
    console.error(`Failed to write session memory: ${error}`);
    return false;
  }
}

export function formatSessionMemory(memory: SessionMemory): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`ticket_id: ${memory.ticketId}`);
  lines.push(`status: ${memory.status}`);
  lines.push(`agent: ${memory.agent}`);
  lines.push(`branch: ${memory.branch}`);
  lines.push(`started_at: ${memory.startedAt}`);
  lines.push(`last_updated: ${memory.lastUpdatedAt}`);
  lines.push("---");
  lines.push("");

  lines.push("## Session Summary");
  lines.push(memory.summary || "Working on ticket implementation.");
  lines.push("");

  lines.push("## Recent Activity");
  if (memory.recentActivity.length > 0) {
    for (const event of memory.recentActivity.slice(0, MAX_EVENTS)) {
      lines.push(`- [${event.timestamp}] ${event.description}`);
    }
  } else {
    lines.push("No activity recorded yet.");
  }
  lines.push("");

  lines.push("## Key Decisions");
  if (memory.keyDecisions.length > 0) {
    for (const decision of memory.keyDecisions) {
      lines.push(`- ${decision}`);
    }
  } else {
    lines.push("No key decisions recorded yet.");
  }

  return lines.join("\n");
}

export function createSessionMemory(
  ticketId: string,
  status: string,
  agent: string,
  branch: string,
  summary?: string
): SessionMemory {
  const now = new Date().toISOString();
  return {
    ticketId,
    status,
    agent,
    branch,
    startedAt: now,
    lastUpdatedAt: now,
    summary: summary || `Starting work on ${ticketId}`,
    recentActivity: [],
    keyDecisions: [],
  };
}

export function addSessionEvent(
  worktreePath: string,
  event: SessionEvent
): boolean {
  const memory = readSessionMemory(worktreePath);

  if (!memory) {
    console.error("Cannot add event: no session memory found");
    return false;
  }

  memory.recentActivity.unshift(event);

  if (memory.recentActivity.length > MAX_EVENTS) {
    memory.recentActivity = memory.recentActivity.slice(0, MAX_EVENTS);
  }

  memory.lastUpdatedAt = new Date().toISOString();

  return writeSessionMemory(worktreePath, memory);
}

export function addKeyDecision(
  worktreePath: string,
  decision: string
): boolean {
  const memory = readSessionMemory(worktreePath);

  if (!memory) {
    console.error("Cannot add decision: no session memory found");
    return false;
  }

  memory.keyDecisions.push(decision);
  memory.lastUpdatedAt = new Date().toISOString();

  return writeSessionMemory(worktreePath, memory);
}

export function updateSessionStatus(
  worktreePath: string,
  status: string,
  summary?: string
): boolean {
  const memory = readSessionMemory(worktreePath);

  if (!memory) {
    console.error("Cannot update status: no session memory found");
    return false;
  }

  const oldStatus = memory.status;
  memory.status = status;
  memory.lastUpdatedAt = new Date().toISOString();

  if (summary) {
    memory.summary = summary;
  }

  memory.recentActivity.unshift({
    timestamp: memory.lastUpdatedAt,
    type: "status_change",
    description: `Status: ${oldStatus} → ${status}`,
  });

  if (memory.recentActivity.length > MAX_EVENTS) {
    memory.recentActivity = memory.recentActivity.slice(0, MAX_EVENTS);
  }

  return writeSessionMemory(worktreePath, memory);
}

export function hasSessionMemory(worktreePath: string): boolean {
  return existsSync(getContextPath(worktreePath));
}