/** Steering rule setup for agent adapters. */

import { SteeringRule } from "#workflow";
import type { Issue } from "#db";

import type { HarnessOrchestrator } from "./orchestrator.ts";

export function createSteeringRules(
  orchestrator: HarnessOrchestrator,
  issue: Issue,
): SteeringRule[] {
  return orchestrator.getSteeringRules().map((config) => {
    return new SteeringRule({
      config,
      hooks: orchestrator.hooks,
      issue,
      steeringConfig: orchestrator.config.steering,
      getNotifications: () =>
        orchestrator.memory.notifications.getUnread(issue.id),
    });
  });
}
