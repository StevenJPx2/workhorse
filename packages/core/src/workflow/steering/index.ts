/**
 * Steering system for idle agent guidance.
 *
 * Plugins register steering rules that fire when agents go idle,
 * providing workflow-specific reminders.
 *
 * Architecture:
 * - Rules are global (registered with orchestrator)
 * - State (firedOnce, cooldowns, recentHooks) is per-issue
 * - Each adapter creates its own SteeringService instance
 */

export { SteeringService, type SteeringConfig } from "./service.ts";
export type { SteeringCondition, SteeringContext, SteeringRule } from "./types.ts";
