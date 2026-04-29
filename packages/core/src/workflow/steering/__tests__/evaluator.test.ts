/**
 * Tests for steering evaluator functions.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { evaluateRules, formatReminders, matchesCondition } from "../evaluator.ts";
import type { SteeringContext, SteeringRule } from "../types.ts";
import { baseIssue, createMockMemory } from "./fixtures.ts";

describe("evaluateRules", () => {
  let ctx: SteeringContext;

  beforeEach(() => {
    const memory = createMockMemory();
    ctx = {
      issue: baseIssue,
      adapter: null as unknown as SteeringContext["adapter"],
      db: {
        issues: { getByExternalId: () => baseIssue },
      } as unknown as SteeringContext["db"],
      memory,
      notifications: [],
      hasPR: false,
      recentTools: [],
      recentHooks: [],
    };
  });

  it("sorts matching rules by priority descending", async () => {
    const rules = new Map<string, SteeringRule>([
      [
        "test:priority-low",
        {
          id: "test:priority-low",
          name: "Low",
          description: "",
          condition: {},
          reminder: "Low priority",
          priority: 1,
        },
      ],
      [
        "test:priority-high",
        {
          id: "test:priority-high",
          name: "High",
          description: "",
          condition: {},
          reminder: "High priority",
          priority: 10,
        },
      ],
    ]);

    const result = await evaluateRules(rules, ctx, new Set());
    expect(result.matching[0]!.rule.id).toBe("test:priority-high");
    expect(result.matching[1]!.rule.id).toBe("test:priority-low");
  });

  it("calls function reminders and uses return value", async () => {
    const rules = new Map<string, SteeringRule>([
      [
        "test:fn-reminder",
        {
          id: "test:fn-reminder",
          name: "Fn Reminder",
          description: "",
          condition: {},
          reminder: (c) => `Issue: ${c.issue.externalId}`,
        },
      ],
    ]);

    const result = await evaluateRules(rules, ctx, new Set());
    expect(result.matching[0]!.reminder).toContain("Issue: AM-123");
  });

  it("tracks once-per-session rules in firedRules", async () => {
    const rules = new Map<string, SteeringRule>([
      [
        "test:once",
        {
          id: "test:once",
          name: "Once",
          description: "",
          condition: {},
          reminder: "Once!",
          once: true,
        },
      ],
    ]);

    const result = await evaluateRules(rules, ctx, new Set());
    expect(result.firedRules).toContain("test:once");
  });

  it("skips already-fired once-per-session rules", async () => {
    const rules = new Map<string, SteeringRule>([
      [
        "test:once",
        {
          id: "test:once",
          name: "Once",
          description: "",
          condition: {},
          reminder: "Once!",
          once: true,
        },
      ],
    ]);

    // firedOnce is now a simple Set<string> (per-issue)
    const firedOnce = new Set(["test:once"]);

    const result = await evaluateRules(rules, ctx, firedOnce);
    expect(result.matching).toHaveLength(0);
  });
});

describe("matchesCondition", () => {
  let ctx: SteeringContext;

  beforeEach(() => {
    const memory = createMockMemory();
    ctx = {
      issue: baseIssue,
      adapter: null as unknown as SteeringContext["adapter"],
      db: {
        issues: { getByExternalId: () => baseIssue },
      } as unknown as SteeringContext["db"],
      memory,
      notifications: [],
      hasPR: false,
      recentTools: [],
      recentHooks: [],
    };
  });

  it("matches status condition", async () => {
    expect(await matchesCondition({ status: "implementing" }, ctx)).toBe(true);
    expect(await matchesCondition({ status: "done" }, ctx)).toBe(false);
  });

  it("matches source condition", async () => {
    expect(await matchesCondition({ source: "jira" }, ctx)).toBe(true);
    expect(await matchesCondition({ source: "github" }, ctx)).toBe(false);
  });

  it("matches hook condition when recent hook exists", async () => {
    ctx.recentHooks = [{ name: "github:pr.merged", timestamp: Date.now(), payload: {} }];
    expect(await matchesCondition({ hook: "github:pr.merged" }, ctx)).toBe(true);
    expect(await matchesCondition({ hook: "github:pr.closed" }, ctx)).toBe(false);
  });

  it("matches custom when predicate", async () => {
    expect(await matchesCondition({ when: () => true }, ctx)).toBe(true);
    expect(await matchesCondition({ when: () => false }, ctx)).toBe(false);
  });

  it("matches multiple conditions with AND logic", async () => {
    expect(await matchesCondition({ status: "implementing", source: "jira" }, ctx)).toBe(true);
    expect(await matchesCondition({ status: "implementing", source: "github" }, ctx)).toBe(false);
  });
});

describe("formatReminders", () => {
  it("formats single reminder correctly", () => {
    const result = formatReminders(["Do this"]);
    expect(result).toContain("📋 **Reminder:**");
    expect(result).toContain("Do this");
  });

  it("formats multiple reminders with numbering", () => {
    const result = formatReminders(["First", "Second"]);
    expect(result).toContain("📋 **Reminders:**");
    expect(result).toContain("1. First");
    expect(result).toContain("2. Second");
  });
});
