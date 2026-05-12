/**
 * Steering system for idle agent guidance.
 *
 * Plugins register steering rules that fire when agents go idle,
 * providing workflow-specific reminders.
 *
 * Architecture:
 * - Configs are registered with orchestrator (plain objects)
 * - AgentAdapter creates SteeringRule instances with hooks/issue injected
 * - Rules are fully autonomous: subscribe to hooks, evaluate, emit reminders
 */

export { SteeringRule, type SteeringConfig, type SteeringRuleOptions } from "./rule.ts";
export {
  type HookHistoryEntry,
  type ToolHistoryEntry,
  ToolHistoryEntrySchema,
  type SteeringCondition,
  SteeringConditionSchema,
  type SteeringContext,
  SteeringContextSchema,
  type SteeringRuleConfig,
  type SteeringRuleConfigInput,
  SteeringRuleConfigSchema,
} from "./types.ts";
