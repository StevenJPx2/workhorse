/**
 * Steering types for idle agent guidance.
 *
 * Plugins register steering rules that fire when an agent goes idle,
 * providing workflow-specific reminders.
 */

import type { Issue, IssueStatus, Notification } from "#db";
import type { Database } from "#db/database";
import type { MemoryService } from "#services/memory";
import type { AgentAdapter } from "#workflow/orchestrator";

/**
 * Context available to steering rules when evaluating conditions
 * and generating reminders.
 */
export interface SteeringContext {
  /** The issue the idle agent is working on */
  issue: Issue;

  /** The adapter for the idle agent */
  adapter: AgentAdapter;

  /** Database access */
  db: Database;

  /** Memory service */
  memory: MemoryService;

  /** Notifications for this issue */
  notifications: Notification[];

  /** Has a PR been created? (checked via issue.prUrl) */
  hasPR: boolean;

  /** Recent tool calls (last N) */
  recentTools: Array<{ name: string; timestamp: number }>;

  /** Recent hook events for this issue */
  recentHooks: Array<{ name: string; timestamp: number; payload: unknown }>;
}

/**
 * A record of a recently fired hook event.
 */
export interface RecentHookEvent {
  /** Hook name (e.g. "github:pr.merged") */
  name: string;

  /** Timestamp when the hook fired */
  timestamp: number;

  /** Issue ID the hook was for */
  issueId: string;

  /** Hook payload (opaque) */
  payload: unknown;
}

/**
 * Condition for when a steering rule should apply.
 */
export interface SteeringCondition {
  /** Issue status(es) that trigger this rule */
  status?: IssueStatus | IssueStatus[];

  /** Issue source(s) this applies to */
  source?: string | string[];

  /** Hook event(s) that must have recently fired for this issue */
  hook?: string | string[];

  /** Custom predicate for complex conditions */
  when?: (ctx: SteeringContext) => boolean | Promise<boolean>;
}

/**
 * A steering rule defines when to remind an idle agent and what to say.
 */
export interface SteeringRule {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Human-readable description */
  description: string;

  /** When should this rule apply? */
  condition: SteeringCondition;

  /** What reminder to send */
  reminder: string | ((ctx: SteeringContext) => string | Promise<string>);

  /** Priority for ordering (higher = earlier). Default: 0 */
  priority?: number;

  /** Only fire once per session? Default: false */
  once?: boolean;
}
