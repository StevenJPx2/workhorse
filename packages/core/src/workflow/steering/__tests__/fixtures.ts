import { vi } from "vitest";
import type { Issue, IssueStatus } from "#db";
import type { HookEmitter } from "#lib/hooks";
import type { MemoryService } from "#services/memory";
import type { Database } from "#db/database";

export function createMockDb(issue: Issue | undefined): Database {
  return {
    issues: {
      getByExternalId: vi.fn().mockReturnValue(issue),
    },
  } as unknown as Database;
}

export function createMockMemory(): MemoryService {
  return {
    notifications: {
      getUnread: vi.fn().mockReturnValue([]),
    },
  } as unknown as MemoryService;
}

export function createMockHooks(): HookEmitter {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();

  return {
    on: vi.fn((event, handler) => {
      const list = handlers.get(event as string) ?? [];
      list.push(handler as (payload: unknown) => void);
      handlers.set(event as string, list);
    }),
    off: vi.fn(),
    emit: vi.fn((event, payload) => {
      for (const h of handlers.get(event as string) ?? []) {
        h(payload);
      }
    }),
  } as unknown as HookEmitter;
}

export const baseIssue: Issue = {
  id: "uuid-1",
  externalId: "AM-123",
  source: "jira",
  title: "Test issue",
  description: "",
  status: "implementing" as IssueStatus,
  issueType: "task",
  url: null,
  assignee: null,
  labels: null,
  metadata: {},
  worktreePath: null,
  prUrl: null,
  prNumber: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const fastConfig = {
  enabled: true,
  debounceMs: 0,
  maxReminders: 3,
  cooldownMs: 0,
};
