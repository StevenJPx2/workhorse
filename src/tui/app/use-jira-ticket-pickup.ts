/**
 * Hook for handling Jira ticket pickup actions
 *
 * Handles transitioning ticket to "In Progress" and assigning to current user
 */

import type { UseAtlassianReturn } from "../hooks/use-atlassian/index.ts";
import { getTransitionId } from "#core/jira/index.ts";

export interface UseJiraTicketPickupOptions {
  atlassian: UseAtlassianReturn;
}

export interface UseJiraTicketPickupReturn {
  /**
   * Update Jira ticket when picked up:
   * - Assign to current user
   * - Transition to "In Progress" status
   *
   * This is best-effort and won't throw on failure
   */
  onTicketPickup: (ticketKey: string) => Promise<void>;
}

/**
 * Hook that provides Jira ticket pickup functionality
 */
export function useJiraTicketPickup(options: UseJiraTicketPickupOptions): UseJiraTicketPickupReturn {
  const { atlassian } = options;

  const onTicketPickup = async (ticketKey: string): Promise<void> => {
    try {
      // Get current user and transition ID for "planning" (In Progress)
      const [user, transitionId] = await Promise.all([
        atlassian.getCurrentUser(),
        Promise.resolve(getTransitionId("planning")),
      ]);

      // Assign to current user and transition to In Progress
      await Promise.all([
        atlassian.assignIssue(ticketKey, user.accountId),
        transitionId ? atlassian.transitionIssue(ticketKey, transitionId) : Promise.resolve(),
      ]);
    } catch (error) {
      // Log but don't fail - Jira sync is best-effort
      console.error("Failed to update Jira ticket status/assignee:", error);
    }
  };

  return { onTicketPickup };
}
