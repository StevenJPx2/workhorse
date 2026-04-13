/**
 * Session Actions - Modify session memory state
 *
 * Functions for adding events, decisions, and updating session status.
 */

import type { SessionEvent } from "./session-types.ts";
import { MAX_EVENTS } from "./session-types.ts";
import { readSessionMemory, writeSessionMemory } from "./session-memory.ts";

export function addSessionEvent(worktreePath: string, event: SessionEvent): boolean {
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

export function addKeyDecision(worktreePath: string, decision: string): boolean {
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
  summary?: string,
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
  const { existsSync } = require("fs");
  const { join } = require("path");
  const { CONTEXT_FILE } = require("./session-types.ts");
  return existsSync(join(worktreePath, ".jiratown", CONTEXT_FILE));
}
