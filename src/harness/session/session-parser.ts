/**
 * Session Memory - Parse and format helpers
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { type SessionEvent, JIRATOWN_DIR } from "./session-types.ts";

export function ensureJiratownDir(worktreePath: string): void {
  const dirPath = join(worktreePath, JIRATOWN_DIR);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];

  const frontmatter: Record<string, string> = {};
  for (const line of frontmatterStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

export function parseRecentActivity(body: string): SessionEvent[] {
  const events: SessionEvent[] = [];
  const activitySection = body.match(/## Recent Activity.*?\n([\s\S]*?)(?=\n## |$)/);

  if (!activitySection) return events;

  const lines = activitySection[1].trim().split("\n");
  for (const line of lines) {
    const match = line.match(/^- \[([^\]]+)\] (.+)$/);
    if (match) {
      events.push({
        timestamp: match[1],
        type: "agent_message",
        description: match[2],
      });
    }
  }

  return events;
}

export function parseKeyDecisions(body: string): string[] {
  const decisions: string[] = [];
  const decisionsSection = body.match(/## Key Decisions.*?\n([\s\S]*?)(?=\n## |$)/);

  if (!decisionsSection) return decisions;

  const lines = decisionsSection[1].trim().split("\n");
  for (const line of lines) {
    const match = line.match(/^- (.+)$/);
    if (match) {
      decisions.push(match[1]);
    }
  }

  return decisions;
}