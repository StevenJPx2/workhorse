/**
 * Steering system for idle agent guidance.
 *
 * Plugins register steering rules that fire when agents go idle,
 * providing workflow-specific reminders.
 */

export { SteeringService } from "./service";
export type { SteeringCondition, SteeringContext, SteeringRule } from "./types";
