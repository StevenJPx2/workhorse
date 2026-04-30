import { vi } from "vitest";
import type { Issue, IssueStatus } from "#db";
import type { HookEmitter } from "#lib/hooks";
import { SteeringRule } from "../rule.ts";
import { type SteeringRuleConfigInput, SteeringRuleConfigSchema } from "../types.ts";

export function createMockHooks(): HookEmitter {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();

  return {
    on: vi.fn((event, handler) => {
      const list = handlers.get(event as string) ?? [];
      list.push(handler as (payload: unknown) => void);
      handlers.set(event as string, list);
    }),
    off: vi.fn((event, handler) => {
      const list = handlers.get(event as string);
      if (list) {
        const idx = list.indexOf(handler as (payload: unknown) => void);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    emit: vi.fn((event, payload) => {
      for (const h of handlers.get(event as string) ?? []) {
        h(payload);
      }
    }),
  } as unknown as HookEmitter;
}

/** Create a SteeringRule from input config (parses through schema) */
export function createRule(
  config: SteeringRuleConfigInput,
  hooks: HookEmitter,
  issue: Issue = baseIssue,
  steeringConfig = defaultSteeringConfig,
): SteeringRule {
  return new SteeringRule(SteeringRuleConfigSchema.parse(config), hooks, issue, steeringConfig);
}

export const baseIssue: Issue = {
  id: "uuid-1",
  externalId: "AM-123",
  source: "test-source",
  title: "Test issue",
  description: "",
  status: "implementing" as IssueStatus,
  issueType: "task",
  url: null,
  assignee: null,
  labels: null,
  metadata: {},
  worktreePath: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const fastConfig = {
  enabled: true,
  debounceMs: 0,
  maxReminders: 3,
  cooldownMs: 0,
};

/** Default steering config for rule tests */
export const defaultSteeringConfig = {
  debounceMs: 100,
  cooldownMs: 1000,
  maxReminders: 3,
};
